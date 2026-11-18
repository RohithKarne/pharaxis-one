# MIMS case form field inventory — 17 November 2026

Read-only aggregate snapshot of Calder Therapeutics and Vanaja Review Co. No reporter values, case identifiers, or other record contents were retrieved. This is a companion to [the product review](MIMS_CASE_FORM_PRODUCT_REVIEW_2026-11-17.md), which covers hard-coded forms and workflow actions that are not rows in Case Form Fields.

| Organisation | MI cases | AE cases | PC cases | Resolved field rows | On or Required | Required rows | Rows with counted values |
|---|---:|---:|---:|---:|---:|---:|---:|
| Calder Therapeutics | 60,235 | 20,431 | 19,396 | 305 | 184 | 13 | 65 |
| Vanaja Review Co. | 2 | 0 | 0 | 304 | 184 | 13 | 7 |

**Reading this inventory:** “On” means the row is neither hidden nor disabled in field configuration. It can still be suppressed by screen code, section visibility, role, case type, feature flag or conditional rules. “Required” is a stored configuration flag. Some required values are prefilled or system-set and separate action-specific checks are described in the product review. “Counted cases” is the existing MIMS usage-counter metric with organisation-specific rows taking precedence over platform defaults. It counts stored values, including defaults and imported/test records, across historical versions. Zero can exclude false/zero, can miss an alternate store, and never proves that a field is safe to remove. The utility's shared-field counts are across the organisation. These two environments are very differently sized and should not be treated as an adoption comparison.

A few examples show why the count needs context. In Calder, both MI Question Summary and Detailed Question have 60,204 counted cases. This supports retaining the captured detail while simplifying when it appears. Contact Type (100,001), Response Provided (8,728) and Response Date (5,820) are already hidden in Calder but still hold values. Country has 12 counted cases in the configured contact column versus zero for Country of Reporter. Neither count establishes which value older integrations used. A false/zero answer also matters for questions such as Injury Experienced.

**Proposed placement** is a product recommendation, not an instruction to disable Required or delete data. Confirm historical, integration, masking and organisational requirements before implementation. A dash means the field was absent in that organisation or no recorded count was available.

## AE — Causality Assessment

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Drug ID | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Causality Method | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Causality Term | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Causality Reason | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Assessed By | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Assessment Date | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |

## AE — Concomitant Medications

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Drug Name | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Active Substance | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Dose | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Frequency | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Start Date | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| End Date | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Indication | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Was Suspect | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |

## AE — Events & Seriousness

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Event Description | ae / ae | On / 21 | On / 0 | case_ae_events.event_description | Keep within the relevant case type |
| Onset Date | ae / ae | On / 12 | On / 0 | case_ae_events.start_date | More details; confirm policy/use |
| MedDRA Term | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_events.meddra_term | Keep off routine capture; preserve history |
| Outcome | ae / ae | On / 7 | On / 0 | case_ae_events.outcome | More details; confirm policy/use |
| Serious — Death | ae / ae | On / 0 | On / 0 | case_ae_events.is_death | More details; confirm policy/use |
| Serious — Life Threatening | ae / ae | On / 3 | On / 0 | case_ae_events.is_life_threatening | More details; confirm policy/use |
| Reported Causality | ae / ae | On / 0 | On / 0 | case_ae_events.reported_causality | More details; confirm policy/use |
| Serious — Hospitalisation | ae / ae | On / 3 | On / 0 | case_ae_events.is_hospitalization | Reveal when the condition applies |
| Frequency | ae / ae | On / 0 | On / 0 | case_ae_events.frequency | More details; confirm policy/use |
| Serious — Disability | ae / ae | On / 0 | On / 0 | case_ae_events.is_disability | More details; confirm policy/use |
| Seriousness | ae / ae | Hidden / 2 | Hidden / 0 | case_ae_events.seriousness | Keep off routine capture; preserve history |
| Serious — Congenital Anomaly | ae / ae | On / 0 | On / 0 | case_ae_events.is_congenital_anomaly | More details; confirm policy/use |
| Serious — Other Medically Important | ae / ae | On / 0 | On / 0 | case_ae_events.is_other_medically_important | More details; confirm policy/use |
| Causality Assessment | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_events.causality_assessment | Keep off routine capture; preserve history |
| End Date | ae / ae | On / 0 | On / 0 | case_ae_events.end_date | More details; confirm policy/use |
| Verbatim Reaction | ae / ae | On / 3 | On / 0 | case_ae_events.verbatim_reaction | Keep within the relevant case type |
| MedDRA SOC | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| MedDRA HLT | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| MedDRA Version | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Number of Events | ae / ae | Hidden / 0 | Hidden / 0 | configured values | System / read-only context |
| Death Date | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Cause of Death | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Autopsy Performed | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Hospitalization Start Date | ae / ae | On / 0 | On / 0 | case_ae_events.hospitalization_start_date | Reveal when the condition applies |
| Hospitalization End Date | ae / ae | On / 0 | On / 0 | case_ae_events.hospitalization_end_date | Reveal when the condition applies |
| Admission Reason | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## AE — General

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| AE Version | ae / ae | Hidden / 0 | Hidden / 0 | configured values | System / read-only context |
| AE Status | ae / ae | Required / 21 | Required / 0 | case_ae_general.ae_status | Header, deadline or workflow |
| Date of Awareness | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_general.date_of_awareness | Keep off routine capture; preserve history |
| Report Type | ae / ae | On / 0 | On / 0 | case_ae_general.report_type | More details; confirm policy/use |
| Regulatory Reportability | ae / ae | On / 0 | On / 0 | case_ae_general.regulatory_reportability | Header, deadline or workflow |
| Date of Report | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_general.date_of_report | Keep off routine capture; preserve history |
| Reporter Awareness Date | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_general.reporter_awareness_date | Keep off routine capture; preserve history |
| Worldwide Unique Case ID | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Initial Received Date | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Report Source | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Trial ID / Protocol Number | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Sponsor Number | ae / ae | On / 0 | On / 0 | configured values | More details; confirm policy/use |

## AE — Lab Notes

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Lab Notes | ae / ae | On / 0 | On / 0 | case_ae_lab_notes.notes | Specialist / evidence section |

## AE — Lab Results

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Lab Name | ae / ae | On / 0 | On / 0 | case_ae_lab_results.lab_name | Specialist / evidence section |
| Test Date | ae / ae | On / 0 | On / 0 | case_ae_lab_results.test_date | Specialist / evidence section |
| Test Name | ae / ae | On / 0 | On / 0 | case_ae_lab_results.test_name | Specialist / evidence section |
| Result Value | ae / ae | On / 0 | On / 0 | case_ae_lab_results.result | Specialist / evidence section |
| Normal Range | ae / ae | On / 0 | On / 0 | case_ae_lab_results.normal_range | Specialist / evidence section |

## AE — Medical History

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Medical History | ae / ae | On / 0 | On / 0 | case_ae_medical_history.condition_name | Specialist / evidence section |
| Relevant History | ae / ae | On / 0 | On / 0 | case_ae_medical_history.notes | Specialist / evidence section |

## AE — Medical Notes

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Medical Notes | ae / ae | On / 0 | On / 0 | case_ae_medical_notes.notes | Specialist / evidence section |
| Narrative | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |

## AE — Patient Information

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Patient Initials | ae / ae | On / 4 | On / 0 | case_ae_patient_info.patient_initials | Keep within the relevant case type |
| Date of Birth | ae / ae | On / 0 | On / 0 | case_ae_patient_info.date_of_birth | More details; confirm policy/use |
| Age | ae / ae | On / 4 | On / 0 | case_ae_patient_info.age | More details; confirm policy/use |
| Age Unit | ae / ae | On / 4 | On / 0 | case_ae_patient_info.age_unit | More details; confirm policy/use |
| Gender | ae / ae | On / 4 | On / 0 | case_ae_patient_info.sex | More details; confirm policy/use |
| Weight (kg) | ae / ae | On / 3 | On / 0 | case_ae_patient_info.weight_kg | More details; confirm policy/use |
| Height (cm) | ae / ae | On / 0 | On / 0 | case_ae_patient_info.height_cm | More details; confirm policy/use |
| Pregnant | ae / ae | On / 1 | On / 0 | case_ae_patient_info.pregnant | Reveal when the condition applies |
| Patient Country | ae / ae | On / 0 | On / 0 | case_ae_patient_info.patient_country | More details; confirm policy/use |
| Patient ID | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Patient First Initial | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Patient Middle Initial | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Patient Last Initial | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Race / Ethnicity | ae / ae | On / 0 | On / 0 | case_ae_patient_info.ethnicity | More details; confirm policy/use |
| Pregnancy Trimester | ae / ae | On / 1 | On / 0 | case_ae_patient_info.pregnancy_trimester | Reveal when the condition applies |
| Last Menstrual Period | ae / ae | On / 0 | On / 0 | case_ae_patient_info.last_menstrual_date | Reveal when the condition applies |
| Expected Delivery Date | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Gestational Age at Onset | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Birth Weight | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Smoking Status | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Alcohol Use | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Occupation | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| BMI | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## AE — Product Information

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Product Name | ae / ae | On / 21 | On / 0 | case_ae_product_info.product_name | Keep within the relevant case type |
| Batch / Lot Number | ae / ae | On / 4 | On / 0 | case_ae_product_info.batch_lot_number | Keep within the relevant case type |
| Product Type | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Role | ae | On / 3 | On / 0 | case_ae_product_info.product_role | More details; confirm policy/use |
| Dose | ae / ae | On / 3 | On / 0 | case_ae_product_info.dose | More details; confirm policy/use |
| Product Category | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Dose Unit | ae / ae | On / 3 | On / 0 | case_ae_product_info.dose_unit | More details; confirm policy/use |
| Route of Administration | ae / ae | On / 3 | On / 0 | case_ae_product_info.route_of_admin | More details; confirm policy/use |
| Start Date | ae / ae | On / 3 | On / 0 | case_ae_product_info.start_date | More details; confirm policy/use |
| Stop Date | ae / ae | On / 0 | On / 0 | case_ae_product_info.end_date | More details; confirm policy/use |
| Administration Route | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Indication | ae / ae | On / 3 | On / 0 | case_ae_product_info.indication | More details; confirm policy/use |
| Action Taken | ae / ae | On / 3 | On / 0 | case_ae_product_info.action_taken | More details; confirm policy/use |
| Concomitant Medications | ae / ae | Hidden / 0 | Hidden / 0 | case_ae_product_info.is_concomitant | Keep off routine capture; preserve history |
| Is Suspect | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Is Concomitant | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Dechallenge | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Rechallenge | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Brand Name | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Dosage Form | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Strength | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| NDC / GTIN Code | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Marketing Authorization Holder | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Suspect Drug Rank | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Time to Onset | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Cumulative Dose | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## AE — Regulatory Reporting

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Reportable To | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Day-15 Reporting Required | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Day-7 Reporting Required | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Submitted to FDA Date | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| FDA Ack ID | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Submitted to EMA Date | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| EMA Ack ID | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Submitted to PMDA Date | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| PMDA Ack ID | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Reporting Status | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Initial Submission Date | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Last Follow-up Submission Date | ae / ae | On / 0 | On / 0 | configured values | Reveal when the condition applies |

## AE — Treatment of Event

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Treatment Given | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Treatment Description | ae / ae | On / 0 | On / 0 | configured values | Specialist / evidence section |
| Treatment Start | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Treatment End | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Hospitalization Required | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Outcome of Treatment | ae / ae | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## Case Information

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Case Number | shared / info | Required / 1,00,062 | Required / 2 | cases.case_number | System / read-only context |
| Date Received | shared / info | Required / 1,00,031 | Required / 0 | cases.date_received | Header, deadline or workflow |
| Date of Intake | shared / info | Hidden / 1,00,062 | Hidden / 2 | cases.date_of_intake | System / read-only context |
| Latest Information Date | shared | On / 0 | On / 0 | cases.latest_information_date | Header, deadline or workflow |
| Case Type | shared / info | Required / 1,00,062 | Required / 2 | cases.case_type | System / read-only context |
| Case Status | shared / info | Required / 1,00,062 | Required / 2 | cases.status_id | Header, deadline or workflow |
| Case Owner | shared / info | On / 99,995 | On / 0 | cases.case_owner_id | Header, deadline or workflow |
| Organisation | shared / info | Required / 1,00,062 | Required / 2 | cases.org_id | System / read-only context |
| Intake Channel | shared / info | Hidden / 1,00,062 | Hidden / 2 | cases.intake_channel | System / read-only context |
| Priority | shared / info | On / 1,00,061 | On / 2 | cases.priority | Header, deadline or workflow |
| Description | shared / info | On / 1,00,025 | On / 0 | cases.description | Map duplicate narratives before hiding |
| Internal Notes | shared / info | On / 99,985 | On / 0 | cases.internal_notes | More details; confirm policy/use |
| Due Date | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Regulatory Reference Number | shared / info | On / 0 | On / 0 | configured values | Header, deadline or workflow |
| Created By | shared / info | Hidden / 0 | Hidden / 0 | configured values | System / read-only context |
| Case Subtype | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Parent Case ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Worldwide Unique Case ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| External CRM ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| External EMR ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Sales Rep / Territory | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Origin Country | shared / info | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Tags / Labels | shared / info | On / 0 | On / 0 | configured values | Header, deadline or workflow |
| Watchers | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Co-owners | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Case Resolution Type | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Case Closed Date | shared / info | Hidden / 0 | Hidden / 0 | configured values | System / read-only context |
| Closed Reason | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## Communications Log

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Communication Date | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Direction | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Channel | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| From | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| To | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Subject | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Summary | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |

## Contact / Requestor

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| First Name | shared / contacts | Required / 1,00,011 | Required / 0 | case_contacts.first_name | Keep within the relevant case type |
| Prefix | shared / contacts | On / 0 | On / 0 | case_contacts.prefix | More details; confirm policy/use |
| Last Name | shared / contacts | Required / 1,00,011 | Required / 0 | case_contacts.last_name | Keep within the relevant case type |
| Contact Type | shared / contacts | Hidden / 1,00,001 | Hidden / 0 | case_contacts.contact_type | Keep off routine capture; preserve history |
| DNUMD | shared / contacts | On / 0 | — / — | configured values | More details; confirm policy/use |
| Email | shared / contacts | On / 1,00,010 | On / 0 | case_contacts.email | Keep within the relevant case type |
| Phone | shared / contacts | On / 99,984 | On / 0 | case_contacts.phone | Keep within the relevant case type |
| Reporter Type | shared / contacts | On / 40 | On / 0 | case_contacts.reporter_type | Keep within the relevant case type |
| Consent Status | shared / contacts | On / 6 | On / 0 | case_contacts.consent_status | Reveal when the condition applies |
| Specialty | shared / contacts | On / 99,973 | On / 0 | case_contacts.specialty | More details; confirm policy/use |
| Source | shared / contacts | Hidden / 0 | Hidden / 0 | case_contacts.source | Keep off routine capture; preserve history |
| Institution | shared / contacts | On / 99,984 | On / 0 | case_contacts.institution | More details; confirm policy/use |
| Country | shared / contacts | On / 12 | On / 0 | case_contacts.country | Keep within the relevant case type |
| Do Not Update Master Data | shared / contacts | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Country of Reporter | shared / contacts | Hidden / 0 | Hidden / 0 | case_contacts.country_of_reporter | Keep off routine capture; preserve history |
| Qualification | shared / contacts | Hidden / 0 | Hidden / 0 | case_contacts.qualification | Keep off routine capture; preserve history |
| Preferred Contact Method | shared / contacts | On / 6 | On / 0 | case_contacts.preferred_contact_method | Reveal when the condition applies |
| Language Preference | shared / contacts | On / 0 | On / 0 | case_contacts.language_preference | Reveal when the condition applies |

## Linked Records

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Parent Case | shared / info | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Linked Reporter Master ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Linked Patient Master ID | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| External System IDs | shared / info | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## MI — Category & Product

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| MI Category | mi / mi | Required / 60,197 | Required / 0 | case_mi.mi_category | Keep within the relevant case type |
| MI Subcategory | mi / mi | On / 60,189 | On / 0 | case_mi.subcategory | More details; confirm policy/use |
| Product | mi / mi | On / 60,196 | On / 0 | case_mi.product_id | More details; confirm policy/use |
| Question Source | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Question Channel | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Urgency Level | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Patient-specific | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Off-Label Discussion | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## MI — Follow-up & Outcome

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Follow-up Required | mi / mi | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Follow-up Due Date | mi / mi | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Follow-up Channel | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Follow-up Completed | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Follow-up Completed Date | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| HCP Satisfaction Score | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| HCP Feedback Notes | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Closed-Loop Confirmation | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## MI — Question Details

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Question Summary | mi / mi | Required / 60,204 | Required / 0 | case_mi.question_summary | Keep within the relevant case type |
| Detailed Question | mi / mi | On / 60,204 | On / 0 | case_mi.detailed_question | Expand original/inquiry detail |

## MI — Response

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Response Required By | mi / mi | On / 54,377 | On / 0 | case_mi.response_required_by | Header, deadline or workflow |
| Response Provided | mi / mi | Hidden / 8,728 | Hidden / 0 | case_mi.response_provided | Keep off routine capture; preserve history |
| Response Date | mi / mi | Hidden / 5,820 | Hidden / 0 | case_mi.response_date | System / read-only context |
| Response Channel | mi / mi | On / 60,189 | On / 0 | case_mi.response_channel | Reveal when the condition applies |
| MI Status | mi / mi | On / 60,213 | On / 0 | case_mi.status | Header, deadline or workflow |
| Literature Reference | mi / mi | On / 0 | On / 0 | case_mi.literature_reference | More details; confirm policy/use |
| Country-specific PI Reference | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| PI Version Used | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reference Documents Used | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Response Template Used | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Approval Status | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reviewer Name | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reviewer Date | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Approver Name | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Approver Date | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| HCP Wants Written Response | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Translation Required | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Target Language | mi / mi | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |

## PC — General

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| PC Version | pc / pc | Hidden / 0 | Hidden / 0 | configured values | System / read-only context |
| PC Status | pc / pc | Required / 2 | Required / 0 | case_pc_general.pc_status | Header, deadline or workflow |
| PC Category | pc / pc | Required / 2 | Required / 0 | case_pc_general.pc_category | Keep within the relevant case type |
| Complaint Description | pc / pc | Required / 4 | Required / 0 | case_pc_general.complaint_description | Keep within the relevant case type |
| PC Classification | pc / pc | Hidden / 2 | Hidden / 0 | case_pc_general.pc_classification | Keep off routine capture; preserve history |
| Date of Complaint | pc / pc | On / 0 | On / 0 | case_pc_general.date_of_complaint | More details; confirm policy/use |
| Severity | pc / pc | On / 2 | On / 0 | case_pc_general.severity | More details; confirm policy/use |
| Root Cause | pc / pc | Hidden / 0 | Hidden / 0 | case_pc_general.root_cause | Keep off routine capture; preserve history |
| Date Received | pc / pc | Hidden / 0 | Hidden / 0 | case_pc_general.date_received | Keep off routine capture; preserve history |
| Complaint Source | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Initial Reporter | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Visual Defect Type | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Sample Available | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Investigation Required | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Trend / Cluster Flag | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reply Date | pc | On / 0 | On / 0 | case_pc_general.reply_date | More details; confirm policy/use |
| Reply to Complainant | pc | On / 0 | On / 0 | case_pc_general.reply_summary | More details; confirm policy/use |
| Suspected Counterfeit or Tampering | pc | On / 0 | On / 0 | case_pc_general.suspected_counterfeit | Keep within the relevant case type |
| Device Part Involved | pc | On / 1 | On / 0 | case_pc_general.device_involved | Reveal when the condition applies |
| Device Malfunction | pc | On / 1 | On / 0 | case_pc_general.device_malfunction | Reveal when the condition applies |

## PC — Investigation & CAPA

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Investigation Needed | pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Investigation Status | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reason Not Investigated | pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Investigator Assigned | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Decided By | pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Estimated Completion Date | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Actual Completion Date | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Root Cause Analysis | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Investigation Findings | pc / pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| CAPA Required | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| CAPA Reference Number | pc / pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| CAPA Owner | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| CAPA Due Date | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Field Action Required | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Field Action Type | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Regulatory Notification Required | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Reportability Determination | pc / pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Reportability Justification | pc / pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |

## PC — Patient Information

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Patient Initials | pc | On / 0 | On / 0 | case_pc_patient_info.patient_initials | Keep within the relevant case type |
| Patient Name | pc / pc | Hidden / 0 | Hidden / 0 | case_pc_patient_info.patient_name | Keep off routine capture; preserve history |
| Date of Birth | pc / pc | Hidden / 0 | Hidden / 0 | case_pc_patient_info.date_of_birth | Keep off routine capture; preserve history |
| Gender | pc / pc | On / 0 | On / 0 | case_pc_patient_info.sex | More details; confirm policy/use |
| Injury Experienced | pc / pc | On / 0 | On / 0 | case_pc_patient_info.injury_experienced | Keep within the relevant case type |

## PC — Product Information

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Product Name | pc / pc | On / 4 | On / 0 | case_pc_product_info.product_name | Keep within the relevant case type |
| Batch / Lot Number | pc / pc | On / 2 | On / 0 | case_pc_product_info.lot_number | Keep within the relevant case type |
| Product Type | pc / pc | On / 0 | On / 0 | case_pc_product_info.product_type | More details; confirm policy/use |
| Strength | pc | On / 0 | On / 0 | case_pc_product_info.strength | More details; confirm policy/use |
| Expiry Date | pc / pc | On / 0 | On / 0 | case_pc_product_info.expiry_date | More details; confirm policy/use |
| Product Category | pc / pc | On / 0 | On / 0 | case_pc_product_info.product_category | More details; confirm policy/use |
| Manufacturing Date | pc / pc | On / 0 | On / 0 | case_pc_product_info.manufacturing_date | More details; confirm policy/use |
| Pack Size | pc / pc | On / 0 | On / 0 | case_pc_product_info.pack_size | More details; confirm policy/use |
| Storage Conditions | pc / pc | On / 0 | On / 0 | case_pc_product_info.storage_conditions | More details; confirm policy/use |
| Quantity Available for Investigation | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Manufacturing Site | pc / pc | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Distribution Lot Information | pc / pc | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Date Dispensed to Patient | pc / pc | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Distribution Channel | pc / pc | On / 0 | On / 0 | configured values | More details; confirm policy/use |
| Country of Sale | pc / pc | On / 0 | On / 0 | configured values | Reveal when the condition applies |
| Storage Conditions as Reported | pc / pc | Hidden / 0 | Hidden / 0 | configured values | Keep off routine capture; preserve history |
| Transport Conditions | pc / pc | On / 0 | On / 0 | configured values | More details; confirm policy/use |

## PC — Refund & Credit

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Refund Approved | pc / pc | Disabled / 0 | On / 0 | case_pc_refund_credit.refund_approved | Open only for the Quality task |
| Refund Amount | pc / pc | On / 0 | On / 0 | case_pc_refund_credit.refund_amount | Open only for the Quality task |
| Credit Note Number | pc / pc | On / 0 | On / 0 | case_pc_refund_credit.credit_note_number | Open only for the Quality task |
| Refund Notes | pc / pc | On / 0 | On / 0 | case_pc_refund_credit.notes | Open only for the Quality task |

## PC — Replacement

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Replacement Approved | pc / pc | On / 0 | On / 0 | case_pc_replacement.replacement_approved | Open only for the Quality task |
| Replacement Quantity | pc / pc | On / 0 | On / 0 | case_pc_replacement.quantity | Open only for the Quality task |
| Replacement Ship Date | pc / pc | On / 0 | On / 0 | case_pc_replacement.replacement_date | Open only for the Quality task |
| Replacement Notes | pc / pc | On / 0 | On / 0 | case_pc_replacement.notes | Open only for the Quality task |

## PC — Return & Retrieval

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Return Requested | pc / pc | On / 0 | On / 0 | case_pc_return_retrieval.return_requested | Open only for the Quality task |
| Return Date | pc / pc | On / 0 | On / 0 | case_pc_return_retrieval.return_date | Open only for the Quality task |
| Return Address | pc / pc | On / 0 | On / 0 | case_pc_return_retrieval.return_address | Open only for the Quality task |
| Retrieval Method | pc / pc | On / 0 | On / 0 | case_pc_return_retrieval.retrieval_method | Open only for the Quality task |
| Return Notes | pc / pc | On / 0 | On / 0 | case_pc_return_retrieval.notes | Open only for the Quality task |

## Quality Assurance

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| QA Status | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |
| QA Reviewer | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |
| QA Review Date | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |
| QA Findings / Defects | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |
| QA Sign-off | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |
| Quality Score | shared / info | On / 0 | On / 0 | configured values | Open only for the Quality task |

## Reporter Documentation

| Field | Case scope / configured tab | Calder flag / counted cases | Vanaja flag / counted cases | Counted store | Proposed placement |
|---|---|---|---|---|---|
| Original Source Document Reference | shared / contacts | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Reporter Signature on File | shared / contacts | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Consent Form Attached | shared / contacts | On / 0 | On / 0 | configured values | Activity or related-record detail |
| Source Documentation Notes | shared / contacts | On / 0 | On / 0 | configured values | Activity or related-record detail |
