const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  PUBLICATIONS_MANAGER: 'publications_manager',
  MEDICAL_WRITER: 'medical_writer',
  REVIEWER: 'reviewer'
}

const PUBLICATION_STATUSES = [
  'concept',
  'planning',
  'writing',
  'internal_review',
  'journal_submission',
  'accepted',
  'published'
]

const NEXT_STATUS = {
  concept: 'planning',
  planning: 'writing',
  writing: 'internal_review',
  internal_review: 'journal_submission',
  journal_submission: 'accepted',
  accepted: 'published'
}

const PUBLICATION_TYPES = [
  'journal_article',
  'congress_abstract',
  'poster',
  'oral_presentation'
]

const DEFAULT_GPP_ITEMS = [
  'Publication objective and scientific rationale are documented',
  'Authorship eligibility against ICMJE criteria has been reviewed',
  'All contributors and writing support are declared',
  'Funding source and sponsor role are disclosed',
  'Author conflicts/disclosures are collected and up to date',
  'Target journal or congress requirements are captured',
  'Medical, legal, and regulatory review steps are defined',
  'Source data references for claims are linked',
  'Draft quality and reference accuracy checks are complete',
  'Plagiarism and duplication screening is complete',
  'Submission package checklist is complete',
  'Publication timeline milestones are agreed',
  'Final approval chain is documented',
  'Archive and retention metadata is complete',
  'Post-publication communication plan is recorded'
]

const DEFAULT_REQUIRED_GPP_ITEM_KEYS = ['gpp_1', 'gpp_2', 'gpp_3', 'gpp_4', 'gpp_5', 'gpp_7', 'gpp_10', 'gpp_13']

const DISCLOSURE_SIGNOFF_STATUSES = ['pending', 'signed', 'waived']

const SUBMISSION_TYPES = ['journal', 'congress']
const JOURNAL_PEER_REVIEW_STATUSES = ['under_review', 'revision_requested', 'accepted', 'rejected']
const CONGRESS_DECISIONS = ['accepted', 'rejected', 'poster', 'oral_reassigned']

const NOTIFICATION_EVENTS = {
  REVIEW_ASSIGNED: 'review.assigned',
  REVIEW_RETURNED: 'review.returned',
  REVIEW_APPROVED: 'review.approved',
  STATUS_CHANGED: 'publication.status_changed',
  DOCUMENT_UPLOADED: 'document.uploaded',
  MILESTONE_OVERDUE: 'milestone.overdue',
  DISCLOSURE_REQUESTED: 'disclosure.requested',
  DISCLOSURE_UPDATED: 'disclosure.updated',
  SUBMISSION_UPDATED: 'submission.updated',
  USER_INVITED: 'user.invited',
  RESET_REQUESTED: 'password.reset_requested'
}

module.exports = {
  ROLES,
  PUBLICATION_STATUSES,
  NEXT_STATUS,
  PUBLICATION_TYPES,
  DEFAULT_GPP_ITEMS,
  DEFAULT_REQUIRED_GPP_ITEM_KEYS,
  DISCLOSURE_SIGNOFF_STATUSES,
  SUBMISSION_TYPES,
  JOURNAL_PEER_REVIEW_STATUSES,
  CONGRESS_DECISIONS,
  NOTIFICATION_EVENTS
}
