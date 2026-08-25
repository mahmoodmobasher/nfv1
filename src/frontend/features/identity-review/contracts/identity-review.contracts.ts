export { candidateSchema, decisionCommandSchema, decisionResultSchema, decisionSuccessEnvelopeSchema, detailSuccessEnvelopeSchema,
  errorEnvelopeSchema, queueSuccessEnvelopeSchema, reconciliationSchema, reviewDetailSchema, reviewQueueSchema,
  type Candidate, type Capabilities, type DecisionCommand, type DecisionResult, type DimensionDecision, type QueueItem,
  type Reconciliation, type ReviewDetail, type ReviewErrorEnvelope, type ReviewQueue } from "@/frontend/shared/contracts/p1a-transport";
import type { Candidate, DimensionDecision } from "@/frontend/shared/contracts/p1a-transport";
export function decisionFromCandidate(candidate:Candidate):DimensionDecision{return{action:"link",candidateId:candidate.candidateId,targetId:candidate.targetId,expectedTargetVersion:candidate.expectedTargetVersion}}
