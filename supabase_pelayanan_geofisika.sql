-- Jalankan SEKALI di Supabase: SQL Editor > New query > Run.
-- Migrasi ini melengkapi tabel service_requests yang sudah dipakai website.

alter table public.service_requests
  add column if not exists supporting_document_url text,
  add column if not exists response_file_url text,
  add column if not exists payment_document_url text,
  add column if not exists payment_barcode_url text,
  add column if not exists payment_amount numeric(14,2),
  add column if not exists payment_info text,
  add column if not exists payment_proof_url text,
  add column if not exists service_result_url text;

-- Memperbolehkan nama jenis layanan baru tanpa menghapus data lama.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%request_type%'
  loop
    execute format('alter table public.service_requests drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.service_requests
  add constraint service_requests_request_type_check
  check (request_type in ('pendaftaran', 'pelayanan_jasa_geofisika', 'permintaan_data', 'aduan'));

alter table public.service_requests enable row level security;
drop policy if exists "publik membuat permohonan" on public.service_requests;
create policy "publik membuat permohonan" on public.service_requests
for insert to anon, authenticated with check (true);

drop policy if exists "admin melihat permohonan" on public.service_requests;
create policy "admin melihat permohonan" on public.service_requests
for select to authenticated using (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admin memperbarui permohonan" on public.service_requests;
create policy "admin memperbarui permohonan" on public.service_requests
for update to authenticated using (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
) with check (
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- Bucket: dokumen awal pemohon, bukti pembayaran, serta dokumen admin.
insert into storage.buckets (id, name, public)
values
  ('dokumen-pemohon', 'dokumen-pemohon', true),
  ('bukti-pembayaran', 'bukti-pembayaran', true),
  ('dokumen-admin', 'dokumen-admin', true)
on conflict (id) do update set public = true;

drop policy if exists "pemohon unggah dokumen" on storage.objects;
create policy "pemohon unggah dokumen" on storage.objects
for insert to anon, authenticated with check (bucket_id = 'dokumen-pemohon');

drop policy if exists "pemohon unggah bukti bayar" on storage.objects;
create policy "pemohon unggah bukti bayar" on storage.objects
for insert to anon, authenticated with check (bucket_id = 'bukti-pembayaran');

drop policy if exists "publik baca berkas layanan" on storage.objects;
create policy "publik baca berkas layanan" on storage.objects
for select to anon, authenticated using (bucket_id in ('dokumen-pemohon', 'bukti-pembayaran', 'dokumen-admin'));

drop policy if exists "admin unggah dokumen layanan" on storage.objects;
create policy "admin unggah dokumen layanan" on storage.objects
for insert to authenticated with check (
  bucket_id = 'dokumen-admin'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- Cek status hanya membuka informasi satu tiket yang diminta pemohon.
drop function if exists public.cek_status_tiket(text);
create function public.cek_status_tiket(kode text)
returns table (
  id bigint, ticket text, request_type text, jenis_pendaftaran text, jenis_data text[],
  status text, catatan_admin text, updated_at timestamptz, tanggal_mulai date,
  tanggal_selesai date, wilayah text, tujuan_penggunaan text,
  response_file_url text, payment_document_url text, payment_barcode_url text,
  payment_amount numeric, payment_info text, payment_proof_url text,
  service_result_url text
)
language sql security definer set search_path = public as $$
  select id, ticket, request_type, jenis_pendaftaran, jenis_data, status,
    catatan_admin, updated_at, tanggal_mulai, tanggal_selesai, wilayah,
    tujuan_penggunaan, response_file_url, payment_document_url,
    payment_barcode_url, payment_amount, payment_info, payment_proof_url,
    service_result_url
  from public.service_requests
  where upper(ticket) = upper(kode)
  limit 1;
$$;
grant execute on function public.cek_status_tiket(text) to anon, authenticated;

-- Pemohon mengirim bukti berdasarkan kode tiket. Admin tetap yang memverifikasi.
create or replace function public.kirim_bukti_pembayaran(kode text, url_bukti text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.service_requests
  set payment_proof_url = url_bukti,
      status = 'Pembayaran Dikirim',
      updated_at = now()
  where upper(ticket) = upper(kode)
    and request_type in ('pelayanan_jasa_geofisika', 'permintaan_data')
    and payment_proof_url is null;
  return found;
end;
$$;
grant execute on function public.kirim_bukti_pembayaran(text, text) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant insert on public.service_requests to anon, authenticated;
