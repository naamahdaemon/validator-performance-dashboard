WITH RECURSIVE
params AS (
    SELECT
        564480::bigint AS pre_epoch0_global_slot,
        958440::bigint AS mesa_epoch0_global_slot,
        7140::int AS slots_per_epoch,
        290::int AS transition_frontier_depth,
        /* Standalone exporter: return every producer. */
        NULL::text AS producer_wallet_filter
),

/* Transition-frontier metadata used only to classify currently pending blocks. */
archive_bounds AS (
    SELECT MAX(b.height)::int AS max_known_height
    FROM blocks b
),
frontier_bounds AS (
    SELECT
        ab.max_known_height,
        (ab.max_known_height - p.transition_frontier_depth)::int AS finalized_threshold_height
    FROM archive_bounds ab
    CROSS JOIN params p
),
current_tip AS (
    SELECT
        b.id,
        b.height,
        b.parent_id,
        b.global_slot_since_genesis
    FROM blocks b
    ORDER BY
        b.height DESC,
        b.global_slot_since_genesis DESC,
        b.timestamp DESC,
        b.id DESC
    LIMIT 1
),
tip_ancestors AS (
    SELECT
        ct.id,
        ct.height,
        ct.parent_id,
        ARRAY[ct.id] AS path
    FROM current_tip ct

    UNION ALL

    SELECT
        parent.id,
        parent.height,
        parent.parent_id,
        ta.path || parent.id
    FROM tip_ancestors ta
    JOIN blocks parent
      ON parent.id = ta.parent_id
    CROSS JOIN frontier_bounds fb
    WHERE ta.parent_id IS NOT NULL
      AND parent.height > fb.finalized_threshold_height
      AND NOT parent.id = ANY(ta.path)
),
selected_branch_blocks AS MATERIALIZED (
    SELECT id
    FROM tip_ancestors
),

/* Network epochs, independent of each producer's last block. */
epoch_reference AS (
    SELECT b.global_slot_since_genesis AS tip_slot,
        CASE WHEN b.global_slot_since_genesis >= p.mesa_epoch0_global_slot
            THEN p.mesa_epoch0_global_slot ELSE p.pre_epoch0_global_slot END AS era_start,
        CASE WHEN b.global_slot_since_genesis >= p.mesa_epoch0_global_slot
            THEN 'mesa' ELSE 'pre' END AS era
    FROM current_tip b CROSS JOIN params p
),
current_epoch AS (
    SELECT er.*,
        floor((tip_slot - era_start)::numeric / p.slots_per_epoch)::int AS epoch,
        era_start + floor((tip_slot - era_start)::numeric / p.slots_per_epoch)::bigint
            * p.slots_per_epoch AS start_slot
    FROM epoch_reference er CROSS JOIN params p
),
epoch_windows AS (
    SELECT ce.*,
        CASE WHEN ce.start_slot - 1 >= p.mesa_epoch0_global_slot THEN 'mesa' ELSE 'pre' END AS previous_era,
        floor((ce.start_slot - 1 - previous.start)::numeric / p.slots_per_epoch)::int AS previous_epoch,
        previous.start + floor((ce.start_slot - 1 - previous.start)::numeric / p.slots_per_epoch)::bigint
            * p.slots_per_epoch AS previous_start_slot
    FROM current_epoch ce CROSS JOIN params p
    CROSS JOIN LATERAL (
        SELECT CASE WHEN ce.start_slot - 1 >= p.mesa_epoch0_global_slot
            THEN p.mesa_epoch0_global_slot ELSE p.pre_epoch0_global_slot END AS start
    ) previous
),
recent_epoch_counts AS MATERIALIZED (
    SELECT b.creator_id AS public_key_id,
        COUNT(*) FILTER (WHERE b.global_slot_since_genesis < ew.start_slot)::bigint AS blocks_previous_epoch,
        COUNT(*) FILTER (WHERE b.global_slot_since_genesis >= ew.start_slot)::bigint AS blocks_current_epoch
    FROM blocks b CROSS JOIN epoch_windows ew
    WHERE b.global_slot_since_genesis >= ew.previous_start_slot
      AND b.global_slot_since_genesis <= ew.tip_slot
      AND b.chain_status::text = 'canonical'
    GROUP BY b.creator_id
),

/* Coinbase amount for every archived block, across all epochs. */
coinbase_by_block AS MATERIALIZED (
    SELECT
        b.id AS block_id,
        COALESCE(
            SUM(
                CASE
                    WHEN lower(ic.command_type::text) = 'coinbase'
                    THEN ic.fee::numeric
                    ELSE 0
                END
            ),
            0
        )::numeric AS coinbase_nanomina
    FROM blocks b
    LEFT JOIN blocks_internal_commands bic
      ON bic.block_id = b.id
    LEFT JOIN internal_commands ic
      ON ic.id = bic.internal_command_id
    GROUP BY b.id
),

/* Every archived block, classified once, regardless of epoch. */
all_classified_blocks AS MATERIALIZED (
    SELECT
        b.id,
        b.height,
        b.creator_id,
        b.global_slot_since_genesis,
        b.timestamp,
        b.chain_status,
        COALESCE(cb.coinbase_nanomina, 0)::numeric AS coinbase_nanomina,
        CASE
            WHEN b.chain_status::text = 'canonical'
            THEN 'canonical'
            WHEN b.chain_status::text = 'orphaned'
            THEN 'orphaned'
            WHEN b.chain_status::text = 'pending'
             AND b.height <= fb.finalized_threshold_height
            THEN 'pending_old_unexpected'
            WHEN b.chain_status::text = 'pending'
             AND sbb.id IS NOT NULL
            THEN 'pending_on_selected_tip_branch'
            WHEN b.chain_status::text = 'pending'
            THEN 'pending_side_branch'
            ELSE b.chain_status::text
        END AS inferred_chain_status
    FROM blocks b
    CROSS JOIN frontier_bounds fb
    LEFT JOIN coinbase_by_block cb
      ON cb.block_id = b.id
    LEFT JOIN selected_branch_blocks sbb
      ON sbb.id = b.id
),

/* All-time block statistics per producer. */
network_summary AS MATERIALIZED (
    SELECT
        COUNT(*) FILTER (WHERE b.inferred_chain_status = 'canonical') AS confirmed,
        COUNT(*) FILTER (WHERE b.inferred_chain_status = 'pending_on_selected_tip_branch') AS provisional
    FROM all_classified_blocks b CROSS JOIN current_epoch ce
    WHERE b.global_slot_since_genesis BETWEEN ce.start_slot AND ce.tip_slot
),
all_epoch_block_counts AS MATERIALIZED (
    SELECT
        b.creator_id AS public_key_id,
        COUNT(*)::bigint AS total_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.chain_status::text = 'canonical'
        )::bigint AS canonical_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.chain_status::text = 'orphaned'
        )::bigint AS orphaned_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.chain_status::text = 'pending'
        )::bigint AS pending_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.coinbase_nanomina = 0
        )::bigint AS empty_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.inferred_chain_status = 'pending_on_selected_tip_branch'
        )::bigint AS pending_canonical_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.inferred_chain_status = 'pending_side_branch'
        )::bigint AS pending_orphan_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.inferred_chain_status IN (
                'canonical',
                'pending_on_selected_tip_branch'
            )
        )::bigint AS total_canonical_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.inferred_chain_status IN (
                'orphaned',
                'pending_side_branch'
            )
        )::bigint AS total_orphan_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.coinbase_nanomina = 0
              AND b.inferred_chain_status IN (
                  'canonical',
                  'pending_on_selected_tip_branch'
              )
        )::bigint AS empty_canonical_blocks_all_epochs,

        COUNT(*) FILTER (
            WHERE b.coinbase_nanomina = 0
              AND b.inferred_chain_status IN (
                  'orphaned',
                  'pending_side_branch'
              )
        )::bigint AS empty_orphan_blocks_all_epochs,

        MAX(b.global_slot_since_genesis)::bigint AS last_block_global_slot
    FROM all_classified_blocks b
    GROUP BY b.creator_id
),

/* Last produced block metadata per producer. */
producer_history AS MATERIALIZED (
    SELECT
        bc.public_key_id,
        bc.total_blocks_all_epochs,
        bc.canonical_blocks_all_epochs,
        bc.orphaned_blocks_all_epochs,
        bc.pending_blocks_all_epochs,
        bc.empty_blocks_all_epochs,
        bc.pending_canonical_blocks_all_epochs,
        bc.pending_orphan_blocks_all_epochs,
        bc.total_canonical_blocks_all_epochs,
        bc.total_orphan_blocks_all_epochs,
        bc.empty_canonical_blocks_all_epochs,
        bc.empty_orphan_blocks_all_epochs,
        bc.last_block_global_slot,
        MAX(b.height)::int AS last_block_height,
        MAX(b.timestamp) AS last_block_date
    FROM all_epoch_block_counts bc
    JOIN blocks b
      ON b.creator_id = bc.public_key_id
     AND b.global_slot_since_genesis = bc.last_block_global_slot
    GROUP BY
        bc.public_key_id,
        bc.total_blocks_all_epochs,
        bc.canonical_blocks_all_epochs,
        bc.orphaned_blocks_all_epochs,
        bc.pending_blocks_all_epochs,
        bc.empty_blocks_all_epochs,
        bc.pending_canonical_blocks_all_epochs,
        bc.pending_orphan_blocks_all_epochs,
        bc.total_canonical_blocks_all_epochs,
        bc.total_orphan_blocks_all_epochs,
        bc.empty_canonical_blocks_all_epochs,
        bc.empty_orphan_blocks_all_epochs,
        bc.last_block_global_slot
),

/* Only addresses that have actually produced at least one block. */
target_producers AS MATERIALIZED (
    SELECT
        ph.public_key_id,
        ai.id AS account_identifier_id,
        pk.value AS wallet_address,
        ph.total_blocks_all_epochs,
        ph.canonical_blocks_all_epochs,
        ph.orphaned_blocks_all_epochs,
        ph.pending_blocks_all_epochs,
        ph.empty_blocks_all_epochs,
        ph.pending_canonical_blocks_all_epochs,
        ph.pending_orphan_blocks_all_epochs,
        ph.total_canonical_blocks_all_epochs,
        ph.total_orphan_blocks_all_epochs,
        ph.empty_canonical_blocks_all_epochs,
        ph.empty_orphan_blocks_all_epochs,
        ph.last_block_global_slot,
        ph.last_block_height,
        ph.last_block_date
    FROM producer_history ph
    JOIN public_keys pk
      ON pk.id = ph.public_key_id
    LEFT JOIN account_identifiers ai
      ON ai.public_key_id = ph.public_key_id
     AND ai.token_id = 1
    CROSS JOIN params p
    WHERE p.producer_wallet_filter IS NULL
       OR pk.value = p.producer_wallet_filter
),

/* Latest MINA account state across the whole archive. */
latest_account_states AS MATERIALIZED (
    SELECT DISTINCT ON (ai.id)
        ai.public_key_id,
        ai.id AS account_identifier_id,
        aa.balance,
        aa.nonce,
        aa.delegate_id,
        aa.block_id,
        b.height AS source_block_height,
        b.global_slot_since_genesis AS source_global_slot,
        b.timestamp AS source_timestamp
    FROM account_identifiers ai
    JOIN accounts_accessed aa
      ON aa.account_identifier_id = ai.id
    JOIN blocks b
      ON b.id = aa.block_id
    CROSS JOIN params p
    WHERE ai.token_id = 1
      AND b.global_slot_since_genesis >= p.pre_epoch0_global_slot
    ORDER BY
        ai.id,
        b.height DESC,
        b.global_slot_since_genesis DESC,
        b.id DESC
),

delegated_stake_estimate AS MATERIALIZED (
    SELECT
        las.delegate_id AS public_key_id,
        SUM(las.balance::numeric) AS delegated_stake_nanomina,
        ROUND(
            SUM(las.balance::numeric) / 1000000000::numeric,
            6
        ) AS delegated_stake_mina,
        COUNT(*)::int AS delegator_count
    FROM latest_account_states las
    WHERE las.delegate_id IS NOT NULL
    GROUP BY las.delegate_id
),

total_delegated_stake AS (
    SELECT
        COALESCE(
            SUM(las.balance::numeric)
                FILTER (WHERE las.delegate_id IS NOT NULL),
            0
        ) AS total_delegated_stake_nanomina
    FROM latest_account_states las
)

SELECT
    tp.wallet_address,
    vn.name AS validator_name,
    ew.era || ':' || ew.epoch::text AS network_epoch_label,
    ew.tip_slot - ew.start_slot AS network_slot_in_epoch,
    p.slots_per_epoch AS network_slots_per_epoch,
    (SELECT confirmed FROM network_summary) AS network_confirmed_blocks,
    (SELECT provisional FROM network_summary) AS network_provisional_blocks,
    ew.previous_era || ':' || ew.previous_epoch::text AS previous_epoch_label,
    COALESCE(rec.blocks_previous_epoch, 0) AS blocks_previous_epoch,
    COALESCE(rec.blocks_current_epoch, 0) AS blocks_current_epoch,
    COALESCE(rec.blocks_current_epoch, 0) - COALESCE(rec.blocks_previous_epoch, 0) AS blocks_epoch_delta,

    COALESCE(ds.delegated_stake_mina, 0) AS current_stake,

    ROUND(
        CASE
            WHEN tds.total_delegated_stake_nanomina > 0
            THEN COALESCE(ds.delegated_stake_nanomina, 0)
                 / tds.total_delegated_stake_nanomina * 100
            ELSE 0
        END,
        2
    ) AS delegated_stake_pct,

    COALESCE(ds.delegator_count, 0) AS delegator_count,

    CASE
        WHEN latest_state.balance IS NOT NULL
        THEN ROUND(
            latest_state.balance::numeric / 1000000000::numeric,
            6
        )
        ELSE NULL
    END AS balance,

    tp.total_blocks_all_epochs,
    tp.canonical_blocks_all_epochs,
    tp.orphaned_blocks_all_epochs,
    tp.pending_blocks_all_epochs,
    tp.empty_blocks_all_epochs AS "# Empty",

    tp.empty_orphan_blocks_all_epochs AS "# Empty Orphan",
    tp.empty_canonical_blocks_all_epochs AS "# Empty Canonical",
    tp.pending_canonical_blocks_all_epochs AS "# Pending Canonical",
    tp.pending_orphan_blocks_all_epochs AS "# Pending Orphans",
    tp.total_canonical_blocks_all_epochs AS "# Total Canonical",
    tp.total_orphan_blocks_all_epochs AS "# Total Orphans",

    tp.last_block_height,
    (ab.max_known_height - tp.last_block_height) AS blocks_since_last_produced,
    tp.last_block_global_slot,
    TO_CHAR(
        to_timestamp(tp.last_block_date::bigint / 1000.0),
        'YYYY-MM-DD HH24:MI:SS'
    ) AS last_block_date,

    CASE
        WHEN tp.last_block_global_slot >= p.mesa_epoch0_global_slot
        THEN 'mesa'
        ELSE 'pre'
    END AS last_block_era,

    CASE
        WHEN tp.last_block_global_slot >= p.mesa_epoch0_global_slot
        THEN floor(
            (tp.last_block_global_slot - p.mesa_epoch0_global_slot)::numeric
            / p.slots_per_epoch
        )::int
        ELSE floor(
            (tp.last_block_global_slot - p.pre_epoch0_global_slot)::numeric
            / p.slots_per_epoch
        )::int
    END AS last_block_epoch,

    CASE
        WHEN tp.last_block_global_slot >= p.mesa_epoch0_global_slot
        THEN 'mesa:' || floor(
            (tp.last_block_global_slot - p.mesa_epoch0_global_slot)::numeric
            / p.slots_per_epoch
        )::int::text
        ELSE 'pre:' || floor(
            (tp.last_block_global_slot - p.pre_epoch0_global_slot)::numeric
            / p.slots_per_epoch
        )::int::text
    END AS last_block_epoch_label

FROM target_producers tp
LEFT JOIN recent_epoch_counts rec ON rec.public_key_id = tp.public_key_id
LEFT JOIN public.validator_names vn
  ON vn.public_key = tp.wallet_address
LEFT JOIN latest_account_states latest_state
  ON latest_state.account_identifier_id = tp.account_identifier_id
LEFT JOIN delegated_stake_estimate ds
  ON ds.public_key_id = tp.public_key_id
CROSS JOIN params p
CROSS JOIN epoch_windows ew
CROSS JOIN archive_bounds ab
CROSS JOIN total_delegated_stake tds

ORDER BY
    current_stake DESC,
    delegated_stake_pct DESC,
    tp.total_blocks_all_epochs DESC,
    tp.last_block_date DESC,
    tp.wallet_address ASC;
