SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict tDYr1agG1KhMwERrUcs6AQk4WHaCrxlKGvdzdxIzJ1VT17YvZ6LeaoNsjmfSNre

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profil; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profil" ("id", "nama_pengguna", "email", "nama_lengkap", "password_hash", "role", "aktif_status", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id") VALUES
	('admin-gemi-001', 'gemi', 'gemi@gemiprint.com', 'Gemilang Romadhoni', '$2b$12$y.oD2qIMxWquMgCET6M9reottpw5EKkxYZiOIDsYJkL5GCf2r6vEi', 'admin', 1, '2026-05-26 02:32:17.389231+00', '2026-06-12 15:38:48.161847+00', 'pending', NULL, 4, '2026-06-12 15:38:45.917+00', 'server-web', 1, false, NULL, 'server-web-c8bd5fa0-18d3-4fee-8fea-d1794bc9027b');


--
-- Data for Name: accounting_periods; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: accounting_posting_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: kategori_barang; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."kategori_barang" ("id", "nama", "butuh_spesifikasi_status", "urutan_tampilan", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id") VALUES
	('cat-media-cetak', 'Media Cetak', 0, 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-kertas', 'Kertas', 1, 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-kertas-foto', 'Kertas Foto', 1, 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-merchandise', 'Merchandise', 0, 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-substrat-uv', 'Substrat UV', 0, 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-tinta-consumables', 'Tinta & Consumables', 0, 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-finishing', 'Finishing', 1, 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('cat-lain-lain', 'Lain-lain', 0, 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;


--
-- Data for Name: subkategori_barang; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."subkategori_barang" ("id", "kategori_id", "nama", "urutan_tampilan", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id") VALUES
	('sub-mc-flexi', 'cat-media-cetak', 'Flexi/Banner', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-vinyl', 'cat-media-cetak', 'Vinyl', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-sticker', 'cat-media-cetak', 'Sticker', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-backlit', 'cat-media-cetak', 'Backlit', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-owv', 'cat-media-cetak', 'One Way Vision', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-albatross', 'cat-media-cetak', 'Albatross', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-canvas', 'cat-media-cetak', 'Canvas', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-mc-lainlain', 'cat-media-cetak', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-hvs', 'cat-kertas', 'HVS', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-art-paper', 'cat-kertas', 'Art Paper', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-art-carton', 'cat-kertas', 'Art Carton', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-ivory', 'cat-kertas', 'Ivory', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-duplex', 'cat-kertas', 'Duplex', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-bc-bw', 'cat-kertas', 'BC/BW', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-kraft', 'cat-kertas', 'Kraft', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-jasmine', 'cat-kertas', 'Jasmine', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-concorde', 'cat-kertas', 'Concorde', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-linen', 'cat-kertas', 'Linen', 10, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-foto', 'cat-kertas', 'Foto Paper', 11, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kr-lainlain', 'cat-kertas', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kf-glossy', 'cat-kertas-foto', 'Photo Paper Glossy', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kf-matte', 'cat-kertas-foto', 'Photo Paper Matte', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kf-luster', 'cat-kertas-foto', 'Photo Paper Luster', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kf-rc', 'cat-kertas-foto', 'RC Paper', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-kf-inkjet', 'cat-kertas-foto', 'Inkjet Paper', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-totebag', 'cat-merchandise', 'Tote Bag', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-gelas', 'cat-merchandise', 'Gelas/Mug', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-kaos', 'cat-merchandise', 'Kaos', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-payung', 'cat-merchandise', 'Payung', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-pin', 'cat-merchandise', 'Pin/Badge', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-gantungan', 'cat-merchandise', 'Gantungan Kunci', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-idcard', 'cat-merchandise', 'ID Card', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-lanyard', 'cat-merchandise', 'Lanyard', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-tumbler', 'cat-merchandise', 'Tumbler', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-notebook', 'cat-merchandise', 'Notebook', 10, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-pulpen', 'cat-merchandise', 'Pulpen', 11, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-md-lainlain', 'cat-merchandise', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-akrilik', 'cat-substrat-uv', 'Akrilik', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-kayu', 'cat-substrat-uv', 'Kayu', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-mdf', 'cat-substrat-uv', 'MDF', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-aluminium', 'cat-substrat-uv', 'Aluminium', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-kaca', 'cat-substrat-uv', 'Kaca', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-keramik', 'cat-substrat-uv', 'Keramik', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-plastik', 'cat-substrat-uv', 'Plastik/PVC', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-metal', 'cat-substrat-uv', 'Metal', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-kulit', 'cat-substrat-uv', 'Kulit', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-uv-lainlain', 'cat-substrat-uv', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-eco', 'cat-tinta-consumables', 'Tinta Eco Solvent', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-uv', 'cat-tinta-consumables', 'Tinta UV', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-sublim', 'cat-tinta-consumables', 'Tinta Sublim', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-pigment', 'cat-tinta-consumables', 'Tinta Pigment', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-dye', 'cat-tinta-consumables', 'Tinta Dye', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-cleaning', 'cat-tinta-consumables', 'Cleaning Solution', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-tc-lainlain', 'cat-tinta-consumables', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-lam-glossy', 'cat-finishing', 'Laminating Glossy', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-lam-doff', 'cat-finishing', 'Laminating Doff', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-lam-sandblast', 'cat-finishing', 'Laminating Sandblast', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-foam', 'cat-finishing', 'Foam Board', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-kaca', 'cat-finishing', 'Kaca Acrylic', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-bingkai', 'cat-finishing', 'Bingkai', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-double-tape', 'cat-finishing', 'Double Tape', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-lem', 'cat-finishing', 'Lem', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-fn-lainlain', 'cat-finishing', 'Lain-lain', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('sub-ll-umum', 'cat-lain-lain', 'Umum', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL);


--
-- Data for Name: barang; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: barang_roll_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pelanggan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: penawaran; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: biaya_tambahan_penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: chart_of_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: device_registry; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: finance_category_definitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."finance_category_definitions" ("id", "category_code", "display_name", "color_bg", "color_text", "color_border", "direction", "is_active", "display_order", "created_at", "updated_at", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id", "metric_contributions") VALUES
	('fin-cat-hpp', 'HPP', 'Harga Pokok Penjualan', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'kredit', 1, 75, '2026-05-26 02:33:37.469549+00', '2026-05-26 02:33:37.469549+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "biaya_bahan", "amount_field": "kredit"}]'),
	('fin-cat-kas', 'KAS', 'Kas', 'bg-blue-100', 'text-blue-800', 'border-blue-300', 'both', 1, 10, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-supply', 'SUPPLY', 'Supply', 'bg-orange-100', 'text-orange-800', 'border-orange-300', 'kredit', 1, 70, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-hutang', 'HUTANG', 'Hutang', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 110, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-investor', 'INVESTOR', 'Investor', 'bg-purple-100', 'text-purple-800', 'border-purple-300', 'both', 1, 40, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-subsidi', 'SUBSIDI', 'Subsidi', 'bg-yellow-100', 'text-yellow-800', 'border-yellow-300', 'debit', 1, 50, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-maklon', 'MAKLON', 'Maklon', 'bg-fuchsia-100', 'text-fuchsia-800', 'border-fuchsia-300', 'kredit', 1, 78, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-retur-penjualan', 'RETUR_PENJUALAN', 'Retur Penjualan', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 32, '2026-05-26 02:32:17.389231+00', '2026-06-11 09:01:35.49028+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": -1, "column": "omzet", "amount_field": "kredit"}]'),
	('fin-cat-laba', 'LABA', 'Laba', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'both', 1, 80, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, NULL),
	('fin-cat-retur-hpp', 'RETUR_HPP', 'Retur HPP', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'debit', 1, 76, '2026-05-26 02:32:17.389231+00', '2026-06-11 09:01:35.49028+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": -1, "column": "biaya_bahan", "amount_field": "debit"}]'),
	('fin-cat-retur-pembelian', 'RETUR_PEMBELIAN', 'Retur Pembelian', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'debit', 1, 72, '2026-05-26 02:32:17.389231+00', '2026-06-11 09:01:35.49028+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[]'),
	('fin-cat-retur-penjualan-noncash', 'RETUR_PENJUALAN_NONCASH', 'Retur Penjualan (non-kas)', 'bg-rose-50', 'text-rose-700', 'border-rose-200', 'kredit', 1, 33, '2026-05-26 02:32:17.389231+00', '2026-06-11 09:01:35.976201+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": -1, "column": "omzet", "amount_field": "kredit"}]'),
	('fin-cat-omzet', 'OMZET', 'Omzet', 'bg-green-100', 'text-green-800', 'border-green-300', 'debit', 1, 30, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "omzet", "amount_field": "debit"}]'),
	('fin-cat-lunas', 'LUNAS', 'Lunas', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'debit', 1, 60, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "omzet", "amount_field": "debit"}]'),
	('fin-cat-piutang', 'PIUTANG', 'Piutang', 'bg-lime-100', 'text-lime-800', 'border-lime-300', 'debit', 1, 120, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "omzet", "amount_field": "debit"}]'),
	('fin-cat-biaya', 'BIAYA', 'Biaya', 'bg-red-100', 'text-red-800', 'border-red-300', 'kredit', 1, 20, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "biaya_operasional", "amount_field": "kredit"}]'),
	('fin-cat-komisi', 'KOMISI', 'Komisi', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'kredit', 1, 90, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "biaya_operasional", "amount_field": "kredit"}]'),
	('fin-cat-tabungan', 'TABUNGAN', 'Tabungan', 'bg-indigo-100', 'text-indigo-800', 'border-indigo-300', 'kredit', 1, 100, '2026-05-26 02:33:37.469549+00', '2026-06-10 20:21:26.989278+00', 'pending', NULL, 1, NULL, 'server', 1, 0, NULL, NULL, '[{"sign": 1, "column": "biaya_operasional", "amount_field": "kredit"}]');


--
-- Data for Name: finance_metric_column_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."finance_metric_column_rules" ("id", "column_name", "display_name", "rule_type", "formula_expression", "kasbon_conditions", "is_system", "display_order", "created_at", "updated_at") VALUES
	('rule-saldo', 'saldo', 'Saldo', 'saldo', NULL, NULL, 1, 10, '2026-06-10 20:21:30.438202+00', '2026-06-10 20:21:30.438202+00'),
	('rule-omzet', 'omzet', 'Omzet', 'accumulator', NULL, NULL, 0, 20, '2026-06-10 20:21:30.438202+00', '2026-06-10 20:21:30.438202+00'),
	('rule-biaya-ops', 'biaya_operasional', 'Biaya Operasional', 'accumulator', NULL, NULL, 0, 30, '2026-06-10 20:21:30.438202+00', '2026-06-10 20:21:30.438202+00'),
	('rule-biaya-bahan', 'biaya_bahan', 'Biaya Bahan', 'accumulator', NULL, NULL, 0, 40, '2026-06-10 20:21:30.438202+00', '2026-06-10 20:21:30.438202+00'),
	('rule-laba', 'laba_bersih', 'Laba Bersih', 'formula', 'omzet - biaya_operasional - biaya_bahan', NULL, 0, 50, '2026-06-10 20:21:30.438202+00', '2026-06-10 20:21:30.438202+00');


--
-- Data for Name: finance_metric_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: fiscal_periods; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: harga_barang_satuan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: vendor; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pembelian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: hutang_pembelian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: inventory_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: order_produksi; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_produksi; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_finishing; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_pembelian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_penawaran; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: retur_pembelian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_retur_pembelian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: retur_penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_retur_penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: surat_jalan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: item_surat_jalan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: keuangan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: peran_pegawai; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."peran_pegawai" ("id", "role_code", "role_label", "role_group", "description", "display_order", "created_at", "updated_at") VALUES
	('role-pemilik', 'PEMILIK', 'Pemilik / Investor', 'owner', 'Pemilik atau investor usaha', 10, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-direktur', 'DIREKTUR', 'Direktur', 'owner', 'Direksi / direktur', 20, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-komisaris', 'KOMISARIS', 'Komisaris', 'owner', 'Komisaris / pengawas', 30, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-manager', 'MANAGER', 'Manager', 'management', 'Manajer cabang / divisi', 40, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-supervisor', 'SUPERVISOR', 'Supervisor', 'management', 'Pengawas operasional', 50, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-sales', 'SALES', 'Sales / Marketing', 'sales', 'Tenaga penjual / pemasaran', 60, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-karyawan', 'KARYAWAN', 'Karyawan tetap', 'staff', 'Karyawan tetap', 70, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-designer', 'DESIGNER', 'Designer / Operator', 'staff', 'Tenaga kreatif / operator cetak', 80, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-kasir', 'KASIR', 'Kasir / Front office', 'staff', 'Petugas kasir / front office', 90, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-kurir', 'KURIR', 'Kurir / Driver', 'staff', 'Pengantar / driver', 100, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00'),
	('role-lainnya', 'LAINNYA', 'Lainnya', 'other', 'Peran lain yang tidak tercakup di atas', 110, '2026-06-10 20:21:30.825234+00', '2026-06-10 20:21:30.825234+00');


--
-- Data for Name: pegawai; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: komponen_kompensasi; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: kredensial; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: lokasi; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."lokasi" ("id", "nama", "kode", "alamat", "is_default", "aktif_status", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version") VALUES
	('main', 'Gudang Utama', 'MAIN', NULL, 1, 1, '2026-06-11 09:01:34.241181+00', '2026-06-11 09:01:34.241181+00', 'pending', NULL, 1);


--
-- Data for Name: nsfp_pool; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: opsi_finishing; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pelunasan_hutang; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: piutang_penjualan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pelunasan_piutang; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pengaturan_toko; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pengaturan_toko" ("id", "nama_toko", "alamat", "telepon", "email", "npwp", "alamat_npwp", "status_pkp", "ppn_persen_default", "ppn_metode_default", "ppn_default_aktif", "nsfp_kode_transaksi_default", "nsfp_tahun_aktif", "nsfp_seri_terakhir", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "slogan", "website", "bank_nama", "bank_nomor", "bank_atas_nama", "catatan_faktur", "catatan_struk", "inv_prefix", "inv_format", "inv_reset", "inv_padding", "inv_start_seq", "spk_prefix", "spk_format", "spk_reset", "spk_padding", "spk_start_seq") VALUES
	('default', 'gemiprint', NULL, NULL, NULL, NULL, NULL, 0, 11, 'EKSKLUSIF', 0, '01', NULL, NULL, '2026-06-11 09:01:33.517146+00', '2026-06-11 09:01:33.517146+00', 'pending', NULL, 1, 'Digital Printing & Advertising', NULL, 'BCA', '6881276507', 'PT. Grafika Estetika Media Internusa', 'Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.', 'Barang yang sudah dibeli tidak dapat dikembalikan', 'INV', 'PREFIX-DATE-SEQ', 'daily', 3, 1, 'SPK', 'PREFIX-SEQ', 'never', 4, 1);


--
-- Data for Name: proses_gaji; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: pinjaman_karyawan; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: production_material_consumptions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: rumus_buku_kas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."rumus_buku_kas" ("id", "name", "column_key", "db_column", "ast", "enabled", "is_system", "display_order", "description", "created_at", "updated_at", "formula_key", "actor_id", "formula_group", "is_visible_in_summary") VALUES
	('formula-g-omzet', 'Omzet', 'G', 'omzet', '{"cond": {"left": {"left": {"arg": {"arg": {"find": {"type": "literal", "value": "OMZET"}, "type": "search", "within": {"type": "columnRef", "column": "C"}}, "type": "iserror"}, "type": "not"}, "type": "or", "right": {"arg": {"arg": {"find": {"type": "literal", "value": "PIUTANG"}, "type": "search", "within": {"type": "columnRef", "column": "C"}}, "type": "iserror"}, "type": "not"}}, "type": "or", "right": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN_NONCASH"}}}}, "else": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"type": "prevOutput", "column": "G"}, "then": {"type": "literal", "value": 0}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"cond": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN_NONCASH"}}}, "else": {"op": "+", "left": {"type": "prevOutput", "column": "G"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "then": {"op": "-", "left": {"type": "prevOutput", "column": "G"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "if"}, "then": {"cond": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN_NONCASH"}}}, "else": {"type": "columnRef", "column": "D"}, "then": {"op": "-", "left": {"type": "literal", "value": 0}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "if"}, "type": "if"}, "type": "if"}', true, true, 10, 'Akumulasi penjualan + piutang.', '2026-06-10 20:18:20.500117+00', '2026-06-10 20:18:20.500117+00', 'omzet', NULL, 'summary', false),
	('formula-k-laba', 'Laba Bersih', 'K', 'laba_bersih', '{"op": "-", "left": {"type": "outputRef", "column": "G"}, "type": "binaryOp", "right": {"op": "+", "left": {"type": "outputRef", "column": "H"}, "type": "binaryOp", "right": {"type": "outputRef", "column": "I"}}}', true, true, 50, 'Omzet − (Biaya Operasional + Biaya Bahan).', '2026-06-10 20:18:47.926402+00', '2026-06-10 20:18:47.926402+00', 'laba_bersih', NULL, 'summary', false),
	('formula-modal-kas', 'Modal Kas', 'modal_kas', NULL, '{"cond": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "KAS"}}, "else": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"type": "prevOutput", "column": "modal_kas"}, "then": {"type": "literal", "value": 0}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"op": "-", "left": {"op": "+", "left": {"type": "prevOutput", "column": "modal_kas"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "then": {"op": "-", "left": {"type": "columnRef", "column": "D"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "if"}, "type": "if"}', true, true, 60, 'Akumulasi running balance dari transaksi berkategori KAS.', '2026-06-12 15:40:32.999636+00', '2026-06-12 15:40:32.999636+00', 'modal_kas', NULL, 'summary', false),
	('formula-h-biaya-ops', 'Biaya Operasional', 'H', 'biaya_operasional', '{"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"cond": {"left": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "BIAYA"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "TABUNGAN"}}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "GAJI"}}}, "else": {"type": "prevOutput", "column": "H"}, "then": {"op": "+", "left": {"type": "prevOutput", "column": "H"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "if"}, "then": {"cond": {"left": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "BIAYA"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "TABUNGAN"}}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "GAJI"}}}, "else": {"type": "literal", "value": 0}, "then": {"type": "columnRef", "column": "E"}, "type": "if"}, "type": "if"}', true, true, 20, 'Akumulasi BIAYA + TABUNGAN.', '2026-06-10 20:21:30.630253+00', '2026-06-10 20:21:30.630253+00', 'biaya_operasional', NULL, 'summary', false),
	('formula-piutang-kas', 'Saldo Kasbon', 'saldo_kasbon', NULL, '{"cond": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "PINJAMAN_KARYAWAN"}}, "else": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"type": "prevOutput", "column": "saldo_kasbon"}, "then": {"type": "literal", "value": 0}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"op": "-", "left": {"op": "+", "left": {"type": "prevOutput", "column": "saldo_kasbon"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "then": {"op": "-", "left": {"type": "columnRef", "column": "E"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "type": "if"}, "type": "if"}', true, true, 70, 'Total kasbon aktif yang sedang dipinjam karyawan.', '2026-06-12 15:40:32.999636+00', '2026-06-12 15:40:32.999636+00', 'saldo_kasbon', NULL, 'summary', false),
	('formula-i-biaya-bahan', 'Biaya Bahan', 'I', 'biaya_bahan', '{"cond": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "HPP"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_HPP"}}}, "else": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"type": "prevOutput", "column": "I"}, "then": {"type": "literal", "value": 0}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"cond": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_HPP"}}, "else": {"op": "+", "left": {"type": "prevOutput", "column": "I"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "then": {"op": "-", "left": {"type": "prevOutput", "column": "I"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_HPP"}}, "else": {"type": "columnRef", "column": "E"}, "then": {"op": "-", "left": {"type": "literal", "value": 0}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "type": "if"}, "type": "if"}, "type": "if"}', true, true, 30, 'Akumulasi HPP dari barang yang terjual.', '2026-06-10 20:21:30.630253+00', '2026-06-10 20:21:30.630253+00', 'biaya_bahan', NULL, 'summary', false),
	('formula-j-saldo', 'Saldo', 'J', 'saldo', '{"cond": {"left": {"left": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "HPP"}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_HPP"}}}, "type": "or", "right": {"op": "=", "left": {"type": "columnRef", "column": "C"}, "type": "binaryOp", "right": {"type": "literal", "value": "RETUR_PENJUALAN_NONCASH"}}}, "else": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"op": "-", "left": {"op": "+", "left": {"type": "prevOutput", "column": "J"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "D"}}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "then": {"op": "-", "left": {"type": "columnRef", "column": "D"}, "type": "binaryOp", "right": {"type": "columnRef", "column": "E"}}, "type": "if"}, "then": {"cond": {"op": "=", "left": {"type": "row"}, "type": "binaryOp", "right": {"type": "literal", "value": 2}}, "else": {"type": "prevOutput", "column": "J"}, "then": {"type": "literal", "value": 0}, "type": "if"}, "type": "if"}', true, true, 40, 'Saldo kas berjalan (debit − kredit).', '2026-06-10 20:18:47.926402+00', '2026-06-10 20:18:47.926402+00', 'saldo', NULL, 'summary', false),
	('formula-kas', 'Kas', 'kas', NULL, '{"op": "-", "left": {"type": "outputRef", "column": "modal_kas"}, "type": "binaryOp", "right": {"type": "outputRef", "column": "saldo_kasbon"}}', true, true, 80, 'Total kas perusahaan: Modal Kas − Saldo Kasbon.', '2026-06-12 15:40:32.999636+00', '2026-06-12 15:40:32.999636+00', 'kas', NULL, 'summary', false);


--
-- Data for Name: satuan_barang; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."satuan_barang" ("id", "nama", "urutan_tampilan", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id") VALUES
	('unit-meter', 'meter', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-roll', 'roll', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-sheet', 'sheet', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-lembar', 'lembar', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-rim', 'rim', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-pack', 'pack', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-pcs', 'pcs', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-lusin', 'lusin', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-box', 'box', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-liter', 'liter', 10, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-ml', 'ml', 11, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-botol', 'botol', 12, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-cartridge', 'cartridge', 13, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-unit', 'unit', 14, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('unit-m2', 'm²', 0, '2026-05-26 02:32:17.389231+00', '2026-06-10 20:21:31.753214+00', 'pending', NULL, 2, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL);


--
-- Data for Name: slip_gaji; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: spesifikasi_cepat_barang; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."spesifikasi_cepat_barang" ("id", "kategori_id", "tipe_spesifikasi", "nilai_spesifikasi", "urutan_tampilan", "dibuat_pada", "diperbarui_pada", "sync_status", "last_synced_at", "sync_version", "updated_at_server", "updated_by_device", "change_version", "is_deleted", "deleted_at", "client_mutation_id") VALUES
	('spec-kr-size-a0', 'cat-kertas', 'size', 'A0', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a1', 'cat-kertas', 'size', 'A1', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a2', 'cat-kertas', 'size', 'A2', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a3', 'cat-kertas', 'size', 'A3', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a3plus', 'cat-kertas', 'size', 'A3+', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a4', 'cat-kertas', 'size', 'A4', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a5', 'cat-kertas', 'size', 'A5', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-a6', 'cat-kertas', 'size', 'A6', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-b4', 'cat-kertas', 'size', 'B4', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-b5', 'cat-kertas', 'size', 'B5', 10, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-letter', 'cat-kertas', 'size', 'Letter', 11, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-legal', 'cat-kertas', 'size', 'Legal', 12, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-ledger', 'cat-kertas', 'size', 'Ledger', 13, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-tabloid', 'cat-kertas', 'size', 'Tabloid', 14, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-f4', 'cat-kertas', 'size', 'F4', 15, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-folio', 'cat-kertas', 'size', 'Folio', 16, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-r4', 'cat-kertas', 'size', 'R4 (10x15cm)', 17, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-r8', 'cat-kertas', 'size', 'R8 (13x18cm)', 18, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-r16', 'cat-kertas', 'size', 'R16 (20x30cm)', 19, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-size-custom', 'cat-kertas', 'size', 'Custom', 99, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-60', 'cat-kertas', 'weight', '60 gsm', 1, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-70', 'cat-kertas', 'weight', '70 gsm', 2, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-80', 'cat-kertas', 'weight', '80 gsm', 3, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-100', 'cat-kertas', 'weight', '100 gsm', 4, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-120', 'cat-kertas', 'weight', '120 gsm', 5, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-150', 'cat-kertas', 'weight', '150 gsm', 6, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-190', 'cat-kertas', 'weight', '190 gsm', 7, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-210', 'cat-kertas', 'weight', '210 gsm', 8, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-230', 'cat-kertas', 'weight', '230 gsm', 9, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-260', 'cat-kertas', 'weight', '260 gsm', 10, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-310', 'cat-kertas', 'weight', '310 gsm', 11, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL),
	('spec-kr-weight-400', 'cat-kertas', 'weight', '400 gsm', 12, '2026-05-26 02:32:17.389231+00', '2026-05-26 02:32:17.389231+00', 'pending', NULL, 1, '2026-06-10 20:21:26.661382+00', 'server', 1, false, NULL, NULL);


--
-- Data for Name: stock_opnames; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: stock_opname_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: sync_conflicts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: sync_mutation_registry; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."sync_mutation_registry" ("id", "client_mutation_id", "table_name", "record_id", "device_id", "processed_at", "payload_hash") VALUES
	('51974d47-c04a-42e6-8515-3f59424eaf8f', 'server-web-c8bd5fa0-18d3-4fee-8fea-d1794bc9027b', 'profil', 'admin-gemi-001', 'server-web', '2026-06-12 15:38:47.902795+00', '17eeca02f5b365c1b5b453817b21069e2c898ce733937e27f95ab1a3e4e08987'),
	('2b0a5e10-d13a-4a63-815d-6ce3ea7ef3ea', 'server-web-06877254-4bd5-489b-aff0-5f891e6a5038', 'profil', '588392cb-335e-4138-8a30-bb265b888421', 'server-web', '2026-06-12 15:39:23.330264+00', '1d0162ebebcf3cc0ac1d91805139ff1cb21a865dac34a2f0af2c702f720dd4af');


--
-- Data for Name: transaksi_penggantian; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: transaksi_terhitung; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict tDYr1agG1KhMwERrUcs6AQk4WHaCrxlKGvdzdxIzJ1VT17YvZ6LeaoNsjmfSNre

RESET ALL;
