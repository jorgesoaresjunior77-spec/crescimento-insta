-- Correção da simplificação anterior: a migration 2026-09-29_simplify_content_metrics.sql
-- removeu audience_type de content_type_metrics por completo. Isso foi longe demais.
--
-- Regra correta:
--   - views / interactions: MANTÊM a divisão por público (followers / non_followers).
--   - likes / comments / reposts / shares / saves / replies: SEM divisão por público
--     (audience_type deve ser NULL).
--
-- APLICADA SOMENTE em test-growth-intelligence-schema (br-billowing-frost-b5r3pifz).
-- NÃO aplicada em production até autorização explícita.
--
-- Pré-condição verificada (somente leitura) antes de rodar: content_type_metrics tinha
-- 0 linhas na branch de teste (e daily_metrics, audience_locations, audience_age_ranges,
-- audience_genders, audience_countries também 0; accounts=1, cities=7). Por isso o
-- DROP TABLE abaixo não descarta dado real nenhum.
--
-- Reversão: não há dado a restaurar (tabela vazia). Se for necessário desfazer, restaure
-- esta branch a partir de production novamente (reset_from_parent) em vez de tentar
-- reverter statement a statement.

BEGIN;

DROP TABLE content_type_metrics;

CREATE TABLE content_type_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_metric_id uuid NOT NULL REFERENCES daily_metrics(id) ON DELETE CASCADE,
  metric_type text NOT NULL
    CHECK (metric_type IN ('views','interactions','likes','comments','reposts','shares','saves','replies')),
  audience_type text
    CHECK (audience_type IS NULL OR audience_type IN ('followers','non_followers')),
  content_type text NOT NULL CHECK (content_type IN ('reels','posts','stories')),
  value integer NOT NULL CHECK (value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_type_metrics_audience_required_check CHECK (
    (metric_type IN ('views','interactions') AND audience_type IS NOT NULL)
    OR
    (metric_type NOT IN ('views','interactions') AND audience_type IS NULL)
  )
);

-- views/interactions: audience_type sempre presente aqui, UNIQUE normal funciona
-- (nenhuma linha tem audience_type NULL neste subconjunto).
CREATE UNIQUE INDEX content_type_metrics_unique_with_audience
  ON content_type_metrics (daily_metric_id, metric_type, audience_type, content_type)
  WHERE audience_type IS NOT NULL;

-- likes/comments/reposts/shares/saves/replies: audience_type sempre NULL aqui — UNIQUE
-- normal não pegaria duplicidade (NULL <> NULL), por isso o índice parcial dedicado.
CREATE UNIQUE INDEX content_type_metrics_unique_without_audience
  ON content_type_metrics (daily_metric_id, metric_type, content_type)
  WHERE audience_type IS NULL;

CREATE INDEX idx_content_type_metrics_daily_metric ON content_type_metrics (daily_metric_id);

COMMIT;
