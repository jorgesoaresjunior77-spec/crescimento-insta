-- Simplificação do formulário de métricas: remove a dimensão audience_type de
-- content_type_metrics e os 4 campos escalares sem fonte de dado confiável em
-- daily_metrics (views_from_followers/non_followers, interactions_from_followers/
-- non_followers). viewers_total é MANTIDO (dado disponível na prática).
--
-- APLICADA SOMENTE em test-growth-intelligence-schema (br-billowing-frost-b5r3pifz).
-- NÃO aplicada em production até autorização explícita.
--
-- Pré-condição verificada (somente leitura) antes de rodar: na branch de teste,
-- daily_metrics, content_type_metrics, audience_locations, audience_age_ranges,
-- audience_genders e audience_countries tinham 0 linhas; accounts tinha 1 linha e
-- cities tinha 7 linhas. Por isso o DROP COLUMN de audience_type e das 4 colunas de
-- daily_metrics abaixo não descartam dado real nenhum.
--
-- Reversão: não há dado a restaurar (todas as tabelas afetadas estavam vazias). Se
-- for necessário desfazer, restaure esta branch a partir de production novamente
-- (reset_from_parent) em vez de tentar reverter statement a statement.

BEGIN;

-- 1) content_type_metrics: remove a dimensão audience_type (followers/non_followers).
-- Estrutura final: id, daily_metric_id, metric_type, content_type, value, created_at.
ALTER TABLE content_type_metrics
  DROP CONSTRAINT content_type_metrics_daily_metric_id_metric_type_audience_t_key;

ALTER TABLE content_type_metrics
  DROP COLUMN audience_type;

ALTER TABLE content_type_metrics
  ADD CONSTRAINT content_type_metrics_daily_metric_id_metric_type_content_type_key
    UNIQUE (daily_metric_id, metric_type, content_type);

-- metric_type CHECK, content_type CHECK, value >= 0 CHECK, FK daily_metric_id ON
-- DELETE CASCADE e idx_content_type_metrics_daily_metric são preservados como estão.

-- 2) daily_metrics: remove somente os 4 campos escalares sem fonte de dado confiável.
-- viewers_total, reach, views_total, interactions, net_follows, bio_link_taps ficam.
ALTER TABLE daily_metrics
  DROP COLUMN views_from_followers,
  DROP COLUMN views_from_non_followers,
  DROP COLUMN interactions_from_followers,
  DROP COLUMN interactions_from_non_followers;

COMMIT;
