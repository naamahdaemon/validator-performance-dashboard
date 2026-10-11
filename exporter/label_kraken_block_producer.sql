-- User-supplied label. Preserve any existing commission rate.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.validator_names IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.validator_names
SET name = 'Kraken Block Producer', source = 'manual'
WHERE public_key = 'B62qkAhMYM7NWh2M5MABFwpNoqgzoweHr3bv6srWM43bwQMh2pVG82U';

INSERT INTO public.validator_names (public_key, name, source)
SELECT 'B62qkAhMYM7NWh2M5MABFwpNoqgzoweHr3bv6srWM43bwQMh2pVG82U',
       'Kraken Block Producer', 'manual'
WHERE NOT EXISTS (
    SELECT 1 FROM public.validator_names
    WHERE public_key = 'B62qkAhMYM7NWh2M5MABFwpNoqgzoweHr3bv6srWM43bwQMh2pVG82U'
);
COMMIT;
