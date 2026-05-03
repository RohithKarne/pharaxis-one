import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DetailRow } from '../components/DetailRow';
import { FilterChip } from '../components/FilterChip';
import { InboxCard } from '../components/InboxCard';
import { MetricCard } from '../components/MetricCard';
import { SearchField } from '../components/SearchField';
import { SectionCard } from '../components/SectionCard';
import {
  createInboxNote,
  fetchInboxAttachments,
  fetchInboxHistory,
  fetchInboxList,
  fetchInboxNotes,
  fetchInboxReceipts,
  fetchInboxRecommendations,
  fetchInboxSummary,
  fetchInboxThread,
  patchInbox,
} from '../services/api';
import {
  InboxAttachment,
  InboxHistory,
  InboxNote,
  InboxReceipt,
  InboxRecommendation,
  InboxRow,
  InboxSummary,
  InboxThreadItem,
} from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, summarizeText, titleCase } from '../utils/format';

type InboxScreenProps = {
  initialInbox?: InboxRow[];
  initialSummary?: InboxSummary | null;
  refreshVersion?: number;
  token: string;
};

type ReadFilter = 'ALL' | 'UNREAD' | 'READ';

const PAGE_SIZE = 12;

function InfoText({ children }: { children: ReactNode }) {
  return <Text style={styles.infoText}>{children}</Text>;
}

export function InboxScreen({
  initialInbox = [],
  initialSummary = null,
  refreshVersion = 0,
  token,
}: InboxScreenProps) {
  const [loading, setLoading] = useState(initialInbox.length === 0);
  const [savingNote, setSavingNote] = useState(false);
  const [summary, setSummary] = useState<InboxSummary | null>(initialSummary);
  const [rows, setRows] = useState<InboxRow[]>(initialInbox);
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('ALL');
  const [page, setPage] = useState(0);
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);
  const [selectedInbox, setSelectedInbox] = useState<InboxRow | null>(null);
  const [history, setHistory] = useState<InboxHistory | null>(null);
  const [recommendations, setRecommendations] = useState<InboxRecommendation[]>([]);
  const [receipts, setReceipts] = useState<InboxReceipt[]>([]);
  const [notes, setNotes] = useState<InboxNote[]>([]);
  const [thread, setThread] = useState<InboxThreadItem[]>([]);
  const [attachments, setAttachments] = useState<InboxAttachment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshList();
  }, [refreshVersion, token]);

  useEffect(() => {
    if (!selectedInboxId) return;
    const current = rows.find((row) => row.id === selectedInboxId) || null;
    setSelectedInbox(current);
    void loadDetail(selectedInboxId);
  }, [rows, selectedInboxId, refreshVersion]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (readFilter === 'READ' && !item.is_read) return false;
      if (readFilter === 'UNREAD' && item.is_read) return false;
      if (!query) return true;
      return (
        String(item.subject || '').toLowerCase().includes(query) ||
        String(item.sender || '').toLowerCase().includes(query) ||
        String(item.queue_name || '').toLowerCase().includes(query) ||
        String(item.assigned_to || '').toLowerCase().includes(query)
      );
    });
  }, [rows, search, readFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (page + 1 > totalPages) {
      setPage(0);
    }
  }, [page, totalPages]);

  async function refreshList() {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextList] = await Promise.all([
        fetchInboxSummary(token),
        fetchInboxList(token),
      ]);
      setSummary(nextSummary);
      setRows(nextList.inquiries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(inquiryId: number) {
    setDetailLoading(true);
    setError(null);
    try {
      const [nextHistory, nextRecommendations, nextReceipts, nextNotes, nextThread, nextAttachments] =
        await Promise.all([
          fetchInboxHistory(token, inquiryId),
          fetchInboxRecommendations(token, inquiryId),
          fetchInboxReceipts(token, inquiryId),
          fetchInboxNotes(token, inquiryId),
          fetchInboxThread(token, inquiryId),
          fetchInboxAttachments(token, inquiryId),
        ]);
      setHistory(nextHistory);
      setRecommendations(nextRecommendations.recommendations || []);
      setReceipts(nextReceipts.receipts || []);
      setNotes(nextNotes.notes || []);
      setThread((nextThread.thread || []) as InboxThreadItem[]);
      setAttachments(nextAttachments.attachments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inquiry detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleToggleRead() {
    if (!selectedInbox) return;
    setError(null);
    try {
      await patchInbox(token, selectedInbox.id, { is_read: !selectedInbox.is_read });
      setRows((current) =>
        current.map((item) =>
          item.id === selectedInbox.id
            ? { ...item, is_read: !item.is_read }
            : item
        )
      );
      setSelectedInbox((current) => (current ? { ...current, is_read: !current.is_read } : current));
      await loadDetail(selectedInbox.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update read state.');
    }
  }

  async function handleAddNote() {
    if (!selectedInboxId || !noteDraft.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      const payload = await createInboxNote(token, selectedInboxId, noteDraft.trim());
      setNotes((current) => [...current, payload.note]);
      setNoteDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add inbox note.');
    } finally {
      setSavingNote(false);
    }
  }

  if (selectedInboxId) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Inbox detail</Text>
            <Text style={styles.title}>{selectedInbox?.subject || `Inquiry ${selectedInboxId}`}</Text>
          </View>
          <Pressable onPress={() => setSelectedInboxId(null)}>
            <Text style={styles.refreshLink}>Back to list</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {detailLoading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}

        {selectedInbox ? (
          <>
            <View style={styles.metricWrap}>
              <MetricCard accent="sky" label="Queue" value={selectedInbox.queue_name || 'Unrouted'} />
              <MetricCard accent="amber" label="Priority" value={titleCase(selectedInbox.priority)} />
              <MetricCard accent="mint" label="Owner" value={selectedInbox.assigned_to || 'Unassigned'} />
            </View>

            <SectionCard title="Summary">
              <DetailRow label="Sender" value={selectedInbox.sender || 'Unknown'} />
              <DetailRow label="Recipient" value={selectedInbox.recipient || 'Unknown'} />
              <DetailRow label="Mailbox" value={selectedInbox.mailbox_name || 'Unknown'} />
              <DetailRow label="Status" value={selectedInbox.status || 'Open'} />
              <DetailRow label="Triage" value={selectedInbox.triage_state || 'New'} />
              <DetailRow label="Routing note" value={selectedInbox.routing_reason || 'No routing note'} />
              <DetailRow label="Received" value={formatDateTime(selectedInbox.received_at)} />
            </SectionCard>

            <SectionCard title="Actions">
              <Pressable onPress={() => void handleToggleRead()} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>
                  Mark as {selectedInbox.is_read ? 'unread' : 'read'}
                </Text>
              </Pressable>
              <InfoText>
                Read receipts: {receipts.length} · Attachments: {attachments.length}
              </InfoText>
            </SectionCard>

            <SectionCard title="Recommendations">
              {recommendations.length ? (
                recommendations.slice(0, 5).map((item, index) => (
                  <View key={index} style={styles.inlineCard}>
                    <InfoText>{JSON.stringify(item)}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No link recommendations returned.</InfoText>
              )}
            </SectionCard>

            <SectionCard title="Conversation thread">
              {thread.length ? (
                thread.map((item) => (
                  <View key={item.id} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{item.subject || '(No subject)'}</Text>
                    <InfoText>
                      {item.sender || 'Unknown'} → {item.recipient || 'Unknown'}
                    </InfoText>
                    <InfoText>{summarizeText(item.body, 140)}</InfoText>
                    <InfoText>{formatDateTime(item.received_at)}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No thread items found.</InfoText>
              )}
            </SectionCard>

            <SectionCard title="Read receipts and attachments">
              {receipts.length ? (
                receipts.map((item) => (
                  <View key={`${item.user_id}-${item.read_at || item.last_viewed_at}`} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{item.user_name}</Text>
                    <InfoText>{item.email || 'No email'}</InfoText>
                    <InfoText>Read {formatDateTime(item.read_at)}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No read receipts yet.</InfoText>
              )}
              {attachments.length ? (
                attachments.map((item) => (
                  <View key={item.id} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{item.filename}</Text>
                    <InfoText>{item.mime_type || 'Unknown type'}</InfoText>
                    <InfoText>{String(item.size_bytes || 0)} bytes</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No attachments.</InfoText>
              )}
            </SectionCard>

            <SectionCard title="History and notes">
              <DetailRow label="History snapshot" value={JSON.stringify(history || {}, null, 2)} />
              <TextInput
                multiline
                onChangeText={setNoteDraft}
                placeholder="Add an internal inbox note"
                placeholderTextColor={mobileColors.placeholder}
                style={styles.textArea}
                value={noteDraft}
              />
              <Pressable
                disabled={savingNote || !noteDraft.trim()}
                onPress={() => void handleAddNote()}
                style={[styles.actionButton, savingNote || !noteDraft.trim() ? styles.buttonDisabled : null]}
              >
                <Text style={styles.actionButtonText}>{savingNote ? 'Saving...' : 'Add note'}</Text>
              </Pressable>
              {notes.length ? (
                notes.map((item, index) => (
                  <View key={`${item.created_at}-${index}`} style={styles.inlineCard}>
                    <Text style={styles.inlineTitle}>{item.user_name || 'Unknown user'}</Text>
                    <InfoText>{formatDateTime(item.created_at)}</InfoText>
                    <InfoText>{item.note}</InfoText>
                  </View>
                ))
              ) : (
                <InfoText>No internal notes yet.</InfoText>
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
          <Text style={styles.eyebrow}>Inbox</Text>
          <Text style={styles.title}>Real-time intake workload</Text>
        </View>
        <Text onPress={() => void refreshList()} style={styles.refreshLink}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <SearchField onChangeText={(value) => { setSearch(value); setPage(0); }} placeholder="Search subject, sender, queue, or owner" value={search} />

      <View style={styles.filterWrap}>
        {(['ALL', 'UNREAD', 'READ'] as ReadFilter[]).map((item) => (
          <FilterChip
            active={readFilter === item}
            key={item}
            label={item}
            onPress={() => {
              setReadFilter(item);
              setPage(0);
            }}
          />
        ))}
      </View>

      <View style={styles.metricWrap}>
        <MetricCard accent="sky" label="Total" value={summary?.total || 0} />
        <MetricCard accent="amber" label="Response SLA" value={summary?.response_breached || 0} />
        <MetricCard accent="mint" label="Filtered rows" value={filteredRows.length} />
      </View>

      <SectionCard title="Queue mix">
        {Object.entries(summary?.queue || {}).slice(0, 6).map(([queue, count]) => (
          <DetailRow key={queue} label={queue} value={String(count)} />
        ))}
      </SectionCard>

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
        <Text style={styles.sectionTitle}>Latest inquiries</Text>
        <View style={styles.cardStack}>
          {loading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}
          {pagedRows.length ? (
            pagedRows.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedInboxId(item.id)}>
                <InboxCard item={item} />
              </Pressable>
            ))
          ) : !loading ? (
            <InfoText>No inbox records returned for this filter.</InfoText>
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
