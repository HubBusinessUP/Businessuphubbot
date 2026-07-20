-- Applicata in produzione il 2026-07-20 via MCP apply_migration.
--
-- Media degli step del tutorial (screenshot e clip brevi), caricati dall'admin.
-- Pubblico come "avatars": gli URL finiscono dentro le schede che tutti vedono,
-- quindi non c'e' niente di privato da proteggere e si evita di firmare ogni link.
-- La scrittura passa solo dall'edge function con la service key (rotta admin/upload,
-- dietro la guardia x-admin-key).
--
-- Il tetto di 6 MB e' allineato a UPLOAD_MAX in index.ts: il file viaggia in base64
-- dentro il JSON della richiesta, e un video lungo va su YouTube, non qui.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutorial', 'tutorial', true, 6291456,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
