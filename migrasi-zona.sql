-- Jalankan sekali di SQL Editor Supabase untuk fitur Zona (LTHR dan pilihan metode).
alter table public.sl_profile add column if not exists lthr smallint check (lthr between 100 and 220);
alter table public.sl_profile add column if not exists zone_method text not null default 'hrr' check (zone_method in ('hrr','max','lthr'));
