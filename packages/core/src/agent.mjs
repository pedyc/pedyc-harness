export const parseAgentResponse = (name, stdout, validate, ajv) => {
  const trimmed = stdout.trim()
  if (!trimmed) return { ok: true, details: `${name} completed without a response payload.`, payload: {} }
  try {
    const payload = JSON.parse(trimmed)
    if (!validate(payload)) {
      return { ok: false, details: `${name} returned an invalid response: ${ajv.errorsText(validate.errors)}`, payload: {} }
    }
    return { ok: true, details: payload.details ?? `${name} returned a structured response.`, payload }
  } catch {
    return { ok: false, details: `${name} must return one JSON object on stdout.`, payload: {} }
  }
}

export const validateStageResponse = (name, payload) => {
  if (name === 'planner' && (!Array.isArray(payload.implementationPlan) || payload.implementationPlan.length === 0)) {
    return 'planner must return a non-empty implementationPlan.'
  }
  if (name === 'tester') {
    if (typeof payload.approved !== 'boolean') return 'tester must return a boolean approved field.'
    if (!Array.isArray(payload.evidence) || payload.evidence.length === 0) return 'tester must return non-empty evidence.'
  }
  if (name === 'reviewer' && typeof payload.approved !== 'boolean') {
    return 'reviewer must return a boolean approved field.'
  }
  return null
}
