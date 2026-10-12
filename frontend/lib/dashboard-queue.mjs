import { incidentGuide } from './incident-guide.mjs';

// Use the same state/role rules as the detail stepper; a queue click never executes an action.
/** @param {Record<string, any>[]} incidents
 * @param {Record<string, any>} user */
export function dashboardQueue(incidents, user) {
  const isAdmin = user.role === 'ADMIN';
  return incidents.filter(i => !['CLOSED', 'REJECTED'].includes(i.status)).map(incident => {
    const canEdit = isAdmin || !!(user.operatorId && user.operatorId === incident.owner_id);
    const guide = incidentGuide(incident, { isAdmin, canEdit });
    const actionable = isAdmin
      ? ['NEEDS_REVIEW', 'WAITING_APPROVAL', 'FAILED', 'RESOLVED'].includes(incident.status)
      : incident.status === 'RESOLVED' && canEdit && guide.target === 'notes';
    const running = ['REGISTERED', 'ANALYZING', 'RECOVERING'].includes(incident.status);
    return { incident, guide, actionable, running, finishing: incident.status === 'RESOLVED' };
  }).sort((a, b) => Number(b.actionable) - Number(a.actionable)
    || ({P1:0,P2:1,P3:2}[a.incident.severity] ?? 3) - ({P1:0,P2:1,P3:2}[b.incident.severity] ?? 3)
    || (Date.parse(b.incident.created_at) || 0) - (Date.parse(a.incident.created_at) || 0)
    || String(a.incident.id).localeCompare(String(b.incident.id)));
}
