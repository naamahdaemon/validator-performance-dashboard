const PAGE_SIZE = 20;
const MINASCAN_ACCOUNT = "https://minascan.io/mainnet/account/";

const state = {
  all: [],
  filtered: [],
  page: 1,
  sortKey: "current_stake",
  sortDir: "desc",
};

const $ = (id) => document.getElementById(id);

const filters = {
  search: $("search"),
  era: $("era"),
  epoch: $("epoch"),
  dateAfter: $("dateAfter"),
  dateBefore: $("dateBefore"),
  stakeMin: $("stakeMin"),
  stakeMax: $("stakeMax"),
  delegatorsMin: $("delegatorsMin"),
  delegatorsMax: $("delegatorsMax"),
  blocksSinceMin: $("blocksSinceMin"),
  blocksSinceMax: $("blocksSinceMax"),
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(number(value));
}

function parseLastBlockDate(value) {
  if (!value) return null;
  // PostgreSQL query exports YYYY-MM-DD HH:MM:SS. Treat it as UTC.
  const parsed = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateBoundary(value, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}Z`);
}

function populateEpochs() {
  const selected = filters.epoch.value;
  const era = filters.era.value;

  const epochs = [...new Set(
    state.all
      .filter(v => !era || v.last_block_era === era)
      .map(v => v.last_block_epoch)
      .filter(v => v !== null && v !== undefined)
      .map(Number)
  )].sort((a, b) => b - a);

  filters.epoch.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All";
  filters.epoch.appendChild(all);

  for (const epoch of epochs) {
    const option = document.createElement("option");
    option.value = String(epoch);
    option.textContent = String(epoch);
    filters.epoch.appendChild(option);
  }

  if ([...filters.epoch.options].some(o => o.value === selected)) {
    filters.epoch.value = selected;
  }
}

function applyFilters() {
  const q = filters.search.value.trim().toLowerCase();
  const era = filters.era.value;
  const epoch = filters.epoch.value;

  const after = dateBoundary(filters.dateAfter.value, false);
  const before = dateBoundary(filters.dateBefore.value, true);

  const stakeMin = nullableNumber(filters.stakeMin.value);
  const stakeMax = nullableNumber(filters.stakeMax.value);
  const delegatorsMin = nullableNumber(filters.delegatorsMin.value);
  const delegatorsMax = nullableNumber(filters.delegatorsMax.value);
  const blocksSinceMin = nullableNumber(filters.blocksSinceMin.value);
  const blocksSinceMax = nullableNumber(filters.blocksSinceMax.value);

  state.filtered = state.all.filter(v => {
    if (q) {
      const haystack = `${v.validator_name ?? ""} ${v.wallet_address ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (era && v.last_block_era !== era) return false;
    if (epoch !== "" && number(v.last_block_epoch) !== number(epoch)) return false;

    const lastDate = parseLastBlockDate(v.last_block_date);
    if (after && (!lastDate || lastDate < after)) return false;
    if (before && (!lastDate || lastDate > before)) return false;

    const stake = number(v.current_stake);
    if (stakeMin !== null && stake < stakeMin) return false;
    if (stakeMax !== null && stake > stakeMax) return false;

    const delegators = number(v.delegator_count);
    if (delegatorsMin !== null && delegators < delegatorsMin) return false;
    if (delegatorsMax !== null && delegators > delegatorsMax) return false;

    const blocksSince = number(v.blocks_since_last_produced);
    if (blocksSinceMin !== null && blocksSince < blocksSinceMin) return false;
    if (blocksSinceMax !== null && blocksSince > blocksSinceMax) return false;

    return true;
  });

  sortFiltered();
  state.page = 1;
  render();
}

function sortFiltered() {
  const { sortKey, sortDir } = state;
  const factor = sortDir === "asc" ? 1 : -1;

  state.filtered.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];

    if (sortKey === "last_block_date") {
      return factor * ((parseLastBlockDate(av)?.getTime() || 0) - (parseLastBlockDate(bv)?.getTime() || 0));
    }

    if (typeof av === "number" || typeof bv === "number") {
      return factor * (number(av) - number(bv));
    }

    return factor * String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function td(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function barCell(value, max, formatter, className = "num") {
  const cell = document.createElement("td");
  cell.className = `bar-cell ${className}`.trim();

  const bar = document.createElement("div");
  bar.className = "bar";
  const pct = max > 0 ? Math.min(100, (number(value) / max) * 100) : 0;
  bar.style.width = `${pct}%`;

  const span = document.createElement("span");
  span.className = "value";
  span.textContent = formatter(value);

  cell.append(bar, span);
  return cell;
}

function renderRows() {
  const tbody = $("rows");
  tbody.replaceChildren();

  if (!state.filtered.length) {
    const tr = document.createElement("tr");
    const cell = td("No validators match the current filters.", "empty-state");
    cell.colSpan = 10;
    tr.appendChild(cell);
    tbody.appendChild(tr);
    return;
  }

  const start = (state.page - 1) * PAGE_SIZE;
  const pageRows = state.filtered.slice(start, start + PAGE_SIZE);

  const maxStake = Math.max(...state.filtered.map(v => number(v.current_stake)), 0);
  const maxStakePct = Math.max(...state.filtered.map(v => number(v.delegated_stake_pct)), 0);
  const maxDelegators = Math.max(...state.filtered.map(v => number(v.delegator_count)), 0);
  const maxBlocks = Math.max(...state.filtered.map(v => number(v.total_blocks_all_epochs)), 0);

  for (const v of pageRows) {
    const tr = document.createElement("tr");

    const validator = td(v.validator_name || "—", "validator");
    validator.title = v.validator_name || "";
    tr.appendChild(validator);

    const walletCell = document.createElement("td");
    const link = document.createElement("a");
    link.className = "wallet";
    link.href = MINASCAN_ACCOUNT + encodeURIComponent(v.wallet_address || "");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = v.wallet_address || "—";
    link.title = v.wallet_address || "";
    walletCell.appendChild(link);
    tr.appendChild(walletCell);

    tr.appendChild(barCell(v.current_stake, maxStake, x => formatNumber(x, 2)));
    tr.appendChild(barCell(v.delegated_stake_pct, maxStakePct, x => `${formatNumber(x, 2)}%`));
    tr.appendChild(barCell(v.delegator_count, maxDelegators, x => formatNumber(x)));
    tr.appendChild(barCell(v.total_blocks_all_epochs, maxBlocks, x => formatNumber(x)));

    const stale = td(formatNumber(v.blocks_since_last_produced), "num");
    const gap = number(v.blocks_since_last_produced);
    if (gap >= 10000) stale.classList.add("stale-high");
    else if (gap >= 1000) stale.classList.add("stale-mid");
    tr.appendChild(stale);

    tr.appendChild(td(v.last_block_date || "—"));

    const eraCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${v.last_block_era || ""}`;
    badge.textContent = v.last_block_era || "—";
    eraCell.appendChild(badge);
    tr.appendChild(eraCell);

    tr.appendChild(td(v.last_block_epoch ?? "—", "num"));

    tbody.appendChild(tr);
  }
}

function renderPagination() {
  const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);

  $("pageLabel").textContent = `Page ${state.page} / ${pages}`;
  $("firstPage").disabled = state.page <= 1;
  $("prevPage").disabled = state.page <= 1;
  $("nextPage").disabled = state.page >= pages;
  $("lastPage").disabled = state.page >= pages;
}

function renderHeaders() {
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.removeAttribute("data-dir");
    if (th.dataset.sort === state.sortKey) {
      th.dataset.dir = state.sortDir;
    }
  });
}

function render() {
  $("filteredCount").textContent = formatNumber(state.filtered.length);
  renderRows();
  renderPagination();
  renderHeaders();
}

function resetFilters() {
  Object.values(filters).forEach(el => {
    if (el.tagName === "SELECT") el.value = "";
    else el.value = "";
  });
  populateEpochs();
  applyFilters();
}

async function load() {
  const response = await fetch(`./data/validators.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();

  state.all = Array.isArray(payload.validators) ? payload.validators : [];

  $("validatorCount").textContent = formatNumber(payload.validator_count ?? state.all.length);
  $("archiveHeight").textContent = payload.archive_height == null ? "—" : formatNumber(payload.archive_height);

  if (payload.generated_at) {
    const d = new Date(payload.generated_at);
    $("generatedAt").textContent = Number.isNaN(d.getTime()) ? payload.generated_at : d.toLocaleString();
  } else {
    $("generatedAt").textContent = "No snapshot yet";
  }

  populateEpochs();
  applyFilters();
}

Object.values(filters).forEach(el => {
  el.addEventListener("input", () => {
    if (el === filters.era) populateEpochs();
    applyFilters();
  });
  el.addEventListener("change", () => {
    if (el === filters.era) populateEpochs();
    applyFilters();
  });
});

$("resetFilters").addEventListener("click", resetFilters);

document.querySelectorAll("th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = ["validator_name", "wallet_address", "last_block_era"].includes(key) ? "asc" : "desc";
    }
    sortFiltered();
    state.page = 1;
    render();
  });
});

$("firstPage").addEventListener("click", () => { state.page = 1; render(); });
$("prevPage").addEventListener("click", () => { state.page -= 1; render(); });
$("nextPage").addEventListener("click", () => { state.page += 1; render(); });
$("lastPage").addEventListener("click", () => {
  state.page = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  render();
});

load().catch(error => {
  console.error(error);
  $("generatedAt").textContent = "Load error";
  $("rows").innerHTML = '<tr><td colspan="10" class="empty-state">Unable to load data/validators.json.</td></tr>';
});
