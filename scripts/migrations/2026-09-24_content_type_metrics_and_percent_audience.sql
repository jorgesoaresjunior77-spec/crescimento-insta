-- Reestruturação do módulo de métricas: content_type_metrics + audiência percentual.
--
-- APLICADA SOMENTE em test-growth-intelligence-schema (br-billowing-frost-b5r3pifz).
-- NÃO aplicada em production até autorização explícita.
--
-- Pré-condição verificada (somente leitura) antes de rodar: na branch de teste,
-- daily_metrics, audience_locations, audience_age_ranges e audience_genders tinham 0
-- linhas; accounts tinha 1 linha e cities tinha 5 linhas (iguais à production no momento
-- do reset). Por isso os DROP COLUMN abaixo não descartam dado real nenhum.
--
-- Reversão: não há tabela antiga para restaurar via DOWN migration porque as colunas
-- removidas não tinham dado; se for necessário reverter, restaure esta branch a partir de
-- production novamente (reset_from_parent) em vez de tentar desfazer statement a statement.

BEGIN;

-- 1) daily_metrics: seguidores líquidos (pode ser negativo) e toques no link da bio.
ALTER TABLE daily_metrics
  ADD COLUMN net_follows integer,
  ADD COLUMN bio_link_taps integer;

ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_bio_link_taps_nonneg
    CHECK (bio_link_taps IS NULL OR bio_link_taps >= 0);
-- net_follows: sem CHECK de sinal — aceita positivo, zero e negativo por definição.

-- 2) content_type_metrics: tabela relacional única para os 8 grupos de métrica por
-- tipo de conteúdo (reels/posts/stories) x público (followers/non_followers).
-- "TUDO" (seção 6 do pedido) é só um agrupador visual no formulário, não uma linha aqui.
CREATE TABLE content_type_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_metric_id uuid NOT NULL REFERENCES daily_metrics(id) ON DELETE CASCADE,
  metric_type text NOT NULL
    CHECK (metric_type IN ('views','interactions','likes','comments','reposts','shares','saves','replies')),
  audience_type text NOT NULL
    CHECK (audience_type IN ('followers','non_followers')),
  content_type text NOT NULL
    CHECK (content_type IN ('reels','posts','stories')),
  value integer NOT NULL CHECK (value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (daily_metric_id, metric_type, audience_type, content_type)
);
CREATE INDEX idx_content_type_metrics_daily_metric ON content_type_metrics (daily_metric_id);

-- 3) audience_genders: followers_count (contagem) -> percent (percentual nativo).
ALTER TABLE audience_genders
  ADD COLUMN percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100);
ALTER TABLE audience_genders
  DROP COLUMN followers_count;
-- gender, o CHECK de enum, e a UNIQUE(daily_metric_id, gender) já existentes são mantidos.

-- 4) audience_age_ranges: + gender, followers_count -> percent, unicidade por (data, faixa, gênero).
ALTER TABLE audience_age_ranges
  ADD COLUMN gender text NOT NULL CHECK (gender IN ('female','male')),
  ADD COLUMN percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100);

ALTER TABLE audience_age_ranges
  DROP CONSTRAINT audience_age_ranges_daily_metric_id_age_range_key;
ALTER TABLE audience_age_ranges
  ADD CONSTRAINT audience_age_ranges_daily_metric_id_age_range_gender_key
    UNIQUE (daily_metric_id, age_range, gender);

ALTER TABLE audience_age_ranges
  DROP COLUMN followers_count;
-- age_range e seu CHECK de enum (13-17 ... 65+) são mantidos como estão.

-- 5) audience_locations: followers_count (contagem) -> percent (percentual nativo).
-- city, city_id (FK para cities) e a UNIQUE(daily_metric_id, city) são preservados
-- exatamente como já existiam — só o valor associado à cidade muda de contagem p/ percentual.
ALTER TABLE audience_locations
  ADD COLUMN percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100);
ALTER TABLE audience_locations
  DROP COLUMN followers_count;

-- 6) audience_countries: nova tabela, mesmo padrão de audience_locations/age_ranges/genders.
CREATE TABLE audience_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_metric_id uuid NOT NULL REFERENCES daily_metrics(id) ON DELETE CASCADE,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  country_name text NOT NULL,
  percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (daily_metric_id, country_code)
);
CREATE INDEX idx_audience_countries_daily_metric ON audience_countries (daily_metric_id);

COMMIT;
