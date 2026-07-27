-- Phase 4 data completion — applied to Supabase axpqhzjhkunrsasxoria on 2026-07-27
-- via MCP execute_sql (DML, not a schema migration). UUIDs are environment-specific
-- to this project; re-run against another project only after re-mapping ids by name.
--
-- 4b: employee_code EMP-001..011, ordered alphabetically by full_name.
-- 4c: roles — Nezar Atiega / Karen Mombay / Yahya Zoubi = admin (Nezar exec approver,
--     Karen finance approver); everyone else view_only.
-- 4d: reports_to reporting lines (see comments per row).
--
-- Resulting tree (verified acyclic, single root):
--   Nezar Atiega (CEO)
--   ├─ Karen Mombay (CFO)
--   ├─ Ahmed Sudgey ─┬─ Abdulrahman Elfgi / Asil Abduldaem / Mohamed Elwkhi
--   │                └─ Yahya Zoubi ─┬─ Abdulfatah Etarhouni
--   │                                └─ Abdulmalik Almaghbub
--   └─ Bassam Drebika ── Mohammed Alrimali

update employees e set
  employee_code        = v.code,
  role                 = v.role,
  reports_to           = v.mgr,
  is_finance_approver  = v.fin,
  is_executive_approver= v.exec
from (values
  ('bba4d124-3159-4a88-b4f7-b6936473f475'::uuid,'EMP-001','view_only','440c4c86-b4d7-47e9-bfa2-7b99591f2a00'::uuid,false,false), -- Abdulfatah Etarhouni -> Yahya
  ('25366657-50e5-43e1-bdd4-9148f0ecd4d4'::uuid,'EMP-002','view_only','440c4c86-b4d7-47e9-bfa2-7b99591f2a00'::uuid,false,false), -- Abdulmalik Almaghbub -> Yahya
  ('7db4a015-409e-4e12-b983-28395fe29949'::uuid,'EMP-003','view_only','7116235b-9816-47f5-bcd6-64ff6d8755e2'::uuid,false,false), -- Abdulrahman Elfgi -> Ahmed
  ('7116235b-9816-47f5-bcd6-64ff6d8755e2'::uuid,'EMP-004','view_only','72c31bd1-fa49-454d-83f0-880577ae986e'::uuid,false,false), -- Ahmed Sudgey -> Nezar
  ('7368a113-db0a-44c6-b8de-013b2dbcb89c'::uuid,'EMP-005','view_only','7116235b-9816-47f5-bcd6-64ff6d8755e2'::uuid,false,false), -- Asil Abduldaem -> Ahmed
  ('ef177eef-dcd5-4d0d-bc0f-2b3d987d79ee'::uuid,'EMP-006','view_only','72c31bd1-fa49-454d-83f0-880577ae986e'::uuid,false,false), -- Bassam Drebika -> Nezar
  ('17d2f97c-442c-4d50-9c5f-bf11532abfc0'::uuid,'EMP-007','admin','72c31bd1-fa49-454d-83f0-880577ae986e'::uuid,true,false),      -- Karen Mombay (finance) -> Nezar
  ('b3884c67-f972-44a1-a8d2-0e2855dfdebb'::uuid,'EMP-008','view_only','7116235b-9816-47f5-bcd6-64ff6d8755e2'::uuid,false,false), -- Mohamed Elwkhi -> Ahmed
  ('eb9249a4-9dbd-4667-97b7-bf872beecd4c'::uuid,'EMP-009','view_only','ef177eef-dcd5-4d0d-bc0f-2b3d987d79ee'::uuid,false,false), -- Mohammed Alrimali -> Bassam
  ('72c31bd1-fa49-454d-83f0-880577ae986e'::uuid,'EMP-010','admin',NULL::uuid,false,true),                                        -- Nezar Atiega (CEO, exec) -> NULL
  ('440c4c86-b4d7-47e9-bfa2-7b99591f2a00'::uuid,'EMP-011','admin','7116235b-9816-47f5-bcd6-64ff6d8755e2'::uuid,false,false)      -- Yahya Zoubi -> Ahmed
) as v(id,code,role,mgr,fin,exec)
where e.id = v.id;

-- NOTE (4g): Nezar Atiega's stored email is natiega@petgo.ly — it does NOT follow the
-- first.last@petgo.ly pattern used by everyone else. FLAGGED, left unchanged as instructed.
