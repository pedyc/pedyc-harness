/**
 * The pre-1.3 projection of one verification gate and its outcome.
 *
 * Evidence is the model of record now (see `./evidence.ts`): it carries trust,
 * exit code, duration and output digests, which this shape cannot. This stays
 * because it is part of the published `RunResult` and of the provider wire
 * protocol, and it is derived from evidence by `toVerificationCheck` rather
 * than maintained beside it.
 */
export interface VerificationCheck {
  command: string
  result: 'pass' | 'fail'
  details: string
}
