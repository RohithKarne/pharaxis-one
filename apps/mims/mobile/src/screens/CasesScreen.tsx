import { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CaseCard } from '../components/CaseCard';
import { DetailRow } from '../components/DetailRow';
import { FilterChip } from '../components/FilterChip';
import { MetricCard } from '../components/MetricCard';
import { SearchField } from '../components/SearchField';
import { SectionCard } from '../components/SectionCard';
import {
  createCaseComment,
  fetchCaseAeTransmissions,
  fetchCaseComments,
  fetchCaseCorrespondence,
  fetchCaseDetail,
  fetchCaseIntake,
  fetchCaseMiResponses,
  fetchCasePcTransmissions,
  fetchCasesList,
} from '../services/api';
import {
  CaseComment,
  CaseDetail,
  CaseRow,
  CaseIntakePayload,
  MiResponse,
  Transmission,
} from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, stripHtml, summarizeText, titleCase } from '../utils/format';

type CasesScreenProps = {
  initialCases?: CaseRow[];
  initialTotal?: number;
  refreshVersion?: number;
  token: string;
};

type CaseTypeFilter = 'ALL' | 'MI' | 'AE' | 'PC';

const PAGE_SIZE = 20;

function InfoText({ children }: { children: ReactNode }) {
  return <Text style={styles.infoText}>{children}</Text>;
}

function TransmissionRow({ item }: { item: Transmission }) {
  return (
    <View style={styles.inlineCard}>
      <Text style={styles.inlineTitle}>
        {(item.assignee_name || item.assigned_name || 'Pending assignee')} · {titleCase(item.status)}
      </Text>
      <InfoText>
        Priority {titleCase(item.priority)} · Due {formatDateTime(item.due_date)}
      </InfoText>
      <InfoText>{summarizeText(item.narrative || item.notes || item.resolution_notes, 120)}</InfoText>
    </View>
  );
}

function ResponseRow({ item }: { item: MiResponse }) {
  return (
    <View style={styles.inlineCard}>
      <Text style={styles.inlineTitle}>{item.response_subject || 'Untitled MI response'}</Text>
      <InfoText>
        {titleCase(item.response_status)} · {item.responded_by_name || 'Unknown author'} ·{' '}
        {formatDateTime(item.responded_at || item.created_at)}
      </InfoText>
      <InfoText>{summarizeText(item.response_text, 120)}</InfoText>
    </View>
  );
}

export function CasesScreen({
  initialCases = [],
  initialTotal = 0,
  refreshVersion = 0,
  token,
}: CasesScreenProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CaseTypeFilter>('ALL');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(initialCases.length === 0);
  const [savingComment, setSavingComment] = useState(false);
  const [rows, setRows] = useState<CaseRow[]>(initialCases);
  const [total, setTotal] = useState(initialTotal);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [intake, setIntake] = useState<CaseIntakePayload | null>(null);
  const [responses, setResponses] = useState<MiResponse[]>([]);
  const [aeTransmissions, setAeTransmissions] = useState<Transmission[]>([]);
  const [pcTransmissions, setPcTransmissions] = useState<Transmission[]>([]);
  const [correspondence, setCorrespondence] = useState<Array<Record<string, unknown>>>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadList();
  }, [page, search, typeFilter, refreshVersion, token]);

  useEffect(() => {
    if (!selectedCaseId) return;
    void loadDetail(selectedCaseId);
  }, [selectedCaseId, refreshVersion, token]);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchCasesList(token, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: search.trim() || undefined,
        type: typeFilter,
      });
      setRows(payload.rows || []);
      setTotal(Number(payload.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(caseId: number) {
    setDetailLoading(true);
    setError(null);
    try {
      const [detail, nextComments, nextIntake, nextResponses, nextAe, nextPc, nextCorrespondence] =
        await Promise.all([
          fetchCaseDetail(token, caseId),
          fetchCaseComments(token, caseId),
          fetchCaseIntake(token, caseId),
          fetchCaseMiResponses(token, caseId),
          fetchCaseAeTransmissions(token, caseId),
          fetchCasePcTransmissions(token, caseId),
          fetchCaseCorrespondence(token, caseId),
        ]);
      setSelectedCase(detail);
      setComments(nextComments || []);
      setIntake(nextIntake);
      setResponses(nextResponses || []);
      setAeTransmissions(nextAe || []);
      setPcTransmissions(nextPc || []);
      setCorrespondence(nextCorrespondence.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAddComment() {
    if (!selectedCaseId || !commentDraft.trim()) return;
    setSavingComment(true);
    setError(null);
    try {
      const saved = await createCaseComment(token, selectedCaseId, commentDraft.trim());
      setComments((current) => [saved, ...current]);
      setCommentDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save case note.');
    } finally {
      setSavingComment(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (selectedCaseId) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Case detail</Text>
            <Text style={styles.title}>{selectedCase?.case_number || `Case ${selectedCaseId}`}</Text>
          </View>
          <Pressable onPress={() => setSelectedCaseId(null)}>
            <Text style={styles.refreshLink}>Back to list</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {detailLoading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}

        {selectedCase ? (
          <>
            <View style={styles.metricWrap}>
              <MetricCard accent="sky" label="Type" value={selectedCase.case_type || 'NA'} />
              <MetricCard accent="amber" label="Status" value={selectedCase.status_name || 'Open'} />
              <MetricCard accent="mint" label="Owner" value={selectedCase.owner_name || 'Unassigned'} />
            </View>

            <SectionCard title="Summary">
              <DetailRow label="Organisation" value={selectedCase.org_name || 'Not set'} />
              <DetailRow label="Site" value={selectedCase.site_name || 'Not set'} />
              <DetailRow label="Priority" value={titleCase(selectedCase.priority)} />
              <DetailRow label="Due date" value={formatDateTime(selectedCase.due_date)} />
              <DetailRow label="Description" value={stripHtml(selectedCase.description) || 'No description'} />
              <DetailRow label="Internal notes" value={stripHtml(selectedCase.internal_notes) || 'No notes'} />
            </SectionCard>

            <SectionCard title="Intake snapshot">
              <DetailRow
                label="Reporter"
                value={JSON.stringify(intake?.reporter || {}, null, 2)}
              />
              <DetailRow
                label="Patient"
                value={JSON.stringify(intake?.patient || {}, null, 2)}
              />
              {selectedCase.case_type === 'AE' ? (
                <DetailRow
                  label="AE intake"
                  value={JSON.stringify(intake?.ae_intake || {}, null, 2)}
                />
              ) : null}
              {selectedCase.case_type === 'PC' ? (
                <DetailRow
                  label="PC intake"
                  value={JSON.stringify(intake?.pc_intake || {}, null, 2)}
                />
              ) : null}
            </SectionCard>

            {selectedCase.case_type === 'MI' ? (
              <SectionCard title="MI responses">
                {responses.length ? responses.map((item) => <ResponseRow item={item} key={item.id} />) : <InfoText>No MI responses yet.</InfoText>}
              </SectionCard>
            ) : null}

            {selectedCase.case_type === 'AE' ? (
              <SectionCard title="AE transmissions">
                {aeTransmissions.length ? aeTransmissions.map((item) => <TransmissionRow item={item} key={item.id} />) : <InfoText>No AE transmissions yet.</InfoText>}
              </SectionCard>
            ) : null}

            {selectedCase.case_type === 'PC' ? (
              <SectionCard title="PC transmissions">
                {pcTransmissions.length ? pcTransmissions.map((item) => <TransmissionRow item={item} key={item.id} />) : <InfoText>No PC transmissions yet.</InfoText>}
              </SectionCard>
            ) : null}

            <SectionCard title="Linked correspondence">
              {correspondence.length ? (
                correspondence.slice(0, 10).map((item, index) => (
                  <View key={String(item.id || index)} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{String(item.subject || '(No subject)')}</Text>
                    <InfoText>
                      {String(item.sender || 'Unknown')} → {String(item.recipient || 'Unknown')}
                    </InfoText>
                    <InfoText>{formatDateTime(String(item.received_at || ''))}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No linked inbox correspondence.</InfoText>
              )}
            </SectionCard>

            <SectionCard title="Case notes">
              <TextInput
                multiline
                onChangeText={setCommentDraft}
                placeholder="Add a mobile case note"
                placeholderTextColor={mobileColors.placeholder}
                style={styles.textArea}
                value={commentDraft}
              />
              <Pressable
                disabled={savingComment || !commentDraft.trim()}
                onPress={() => void handleAddComment()}
                style={[styles.actionButton, savingComment || !commentDraft.trim() ? styles.buttonDisabled : null]}
              >
                <Text style={styles.actionButtonText}>{savingComment ? 'Saving...' : 'Add note'}</Text>
              </Pressable>
              {comments.length ? (
                comments.map((item) => (
                  <View key={item.id} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{item.user_name || item.user_email || 'Unknown user'}</Text>
                    <InfoText>{formatDateTime(item.created_at)}</InfoText>
                    <InfoText>{item.comment}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No notes yet.</InfoText>
              )}
            </SectionCard>
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Cases</Text>
          <Text style={styles.title}>Operational case workload</Text>
        </View>
        <Text onPress={() => void loadList()} style={styles.refreshLink}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <SearchField onChangeText={(value) => { setSearch(value); setPage(0); }} placeholder="Search case number, contact, inquiry, or notes" value={search} />

      <View style={styles.filterWrap}>
        {(['ALL', 'MI', 'AE', 'PC'] as CaseTypeFilter[]).map((item) => (
          <FilterChip
            active={typeFilter === item}
            key={item}
            label={item}
            onPress={() => {
              setTypeFilter(item);
              setPage(0);
            }}
          />
        ))}
      </View>

      <View style={styles.metricWrap}>
        <MetricCard accent="sky" label="Loaded cases" value={total} />
        <MetricCard accent="mint" label="Current page" value={page + 1} />
        <MetricCard accent="amber" label="Total pages" value={totalPages} />
      </View>

      <View style={styles.paginationRow}>
        <Pressable disabled={page === 0} onPress={() => setPage((current) => Math.max(0, current - 1))}>
          <Text style={[styles.refreshLink, page === 0 ? styles.mutedLink : null]}>Previous</Text>
        </Pressable>
        <Text style={styles.pageText}>
          {page + 1} / {totalPages}
        </Text>
        <Pressable disabled={page + 1 >= totalPages} onPress={() => setPage((current) => current + 1)}>
          <Text style={[styles.refreshLink, page + 1 >= totalPages ? styles.mutedLink : null]}>Next</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Latest cases</Text>
        <View style={styles.cardStack}>
          {loading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}
          {rows.length ? (
            rows.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedCaseId(item.id)}>
                <CaseCard item={item} />
              </Pressable>
            ))
          ) : !loading ? (
            <InfoText>No cases returned for this filter.</InfoText>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 18,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#0369a1',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: mobileColors.textStrong,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  refreshLink: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  mutedLink: {
    color: '#94a3b8',
  },
  metricWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: mobileColors.cardBorder,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  sectionTitle: {
    color: mobileColors.textStrong,
    fontSize: 18,
    fontWeight: '800',
  },
  cardStack: {
    gap: 12,
  },
  inlineCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    gap: 6,
    padding: 14,
  },
  inlineTitle: {
    color: mobileColors.textStrong,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  infoText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pageText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 14,
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    color: mobileColors.textStrong,
    fontSize: 14,
    minHeight: 92,
    padding: 12,
    textAlignVertical: 'top',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
