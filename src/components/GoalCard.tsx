import { useEffect, useState } from 'react'
import type { Account, DailyMetric } from '../lib/api'
import { computeVariation, estimateGoalCompletion, formatNumber, formatPercentBR, parseOptionalInt } from '../lib/metrics'

interface GoalCardProps {
  account: Account
  sortedMetrics: DailyMetric[]
  onSave: (goal: number | null) => Promise<void>
}

export default function GoalCard({ account, sortedMetrics, onSave }: GoalCardProps) {
  const [draft, setDraft] = useState(account.follower_goal != null ? String(account.follower_goal) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(account.follower_goal != null ? String(account.follower_goal) : '')
  }, [account.follower_goal])

  const currentFollowers = sortedMetrics.length > 0 ? sortedMetrics[sortedMetrics.length - 1].followers : null
  const goal = account.follower_goal

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = parseOptionalInt(draft)
    if (parsed === 'invalid') {
      setError('Meta deve ser um número inteiro maior ou igual a 0.')
      return
    }
    setSaving(true)
    try {
      await onSave(parsed)
    } catch {
      setError('Erro ao salvar a meta.')
    } finally {
      setSaving(false)
    }
  }

  const remaining = goal !== null && currentFollowers !== null ? goal - currentFollowers : null
  const progressPercent =
    goal !== null && goal > 0 && currentFollowers !== null ? Math.min(100, (currentFollowers / goal) * 100) : null
  const reached = remaining !== null && remaining <= 0

  const estimate =
    goal !== null && currentFollowers !== null ? estimateGoalCompletion(sortedMetrics, currentFollowers, goal) : null

  const lastVariation =
    sortedMetrics.length > 0 ? computeVariation(sortedMetrics[sortedMetrics.length - 1].followers, sortedMetrics.length > 1 ? sortedMetrics[sortedMetrics.length - 2].followers : null) : null

  return (
    <section className="goal-card">
      <h2>Meta de seguidores</h2>
      <form className="goal-form" onSubmit={handleSave}>
        <label>
          Meta
          <input
            type="number"
            min={0}
            placeholder="ex.: 10000"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'OK'}
        </button>
      </form>
      {error && <p className="state-message state-error">{error}</p>}

      <div className="goal-stats">
        <div className="stat">
          <span className="stat-label">Meta cadastrada</span>
          <span className="stat-value">{goal !== null ? formatNumber(goal) : 'indisponível'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Seguidores atuais</span>
          <span className="stat-value">{currentFollowers !== null ? formatNumber(currentFollowers) : 'indisponível'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Faltam</span>
          <span className="stat-value">{reached ? '0' : remaining !== null ? formatNumber(remaining) : 'indisponível'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Variação (último registro)</span>
          {lastVariation ? (
            <span className={`stat-value ${lastVariation.absolute >= 0 ? 'positive' : 'negative'}`}>
              {lastVariation.absolute > 0 ? '+' : ''}
              {lastVariation.absolute.toLocaleString('pt-BR')}
              {lastVariation.percent !== null ? ` (${lastVariation.absolute > 0 ? '+' : ''}${formatPercentBR(lastVariation.percent)})` : ''}
            </span>
          ) : (
            <span className="stat-value">indisponível</span>
          )}
        </div>
      </div>

      {goal !== null && currentFollowers !== null && (
        <div className="goal-progress">
          <div className="goal-progress-track">
            <div className="goal-progress-fill" style={{ width: `${progressPercent ?? 0}%` }} />
          </div>
          <span className="goal-progress-label">{formatPercentBR(progressPercent)}</span>
        </div>
      )}

      {reached && <p className="state-message goal-reached">🎉 Meta alcançada!</p>}

      {!reached && goal !== null && currentFollowers !== null && (
        <p className="goal-estimate">
          {estimate?.status === 'estimated' && estimate.daysRemaining !== undefined
            ? `Estimativa: ~${estimate.daysRemaining} dia(s) no ritmo atual de crescimento.`
            : 'Estimativa de tempo ainda não disponível — é preciso mais histórico de crescimento.'}
        </p>
      )}
    </section>
  )
}
