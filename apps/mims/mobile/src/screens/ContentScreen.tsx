import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DetailRow } from '../components/DetailRow';
import { FilterChip } from '../components/FilterChip';
import { SearchField } from '../components/SearchField';
import { SectionCard } from '../components/SectionCard';
import {
  fetchDocumentDetail,
  fetchDocuments,
  fetchFaqDetail,
  fetchFaqs,
  fetchFolders,
  fetchModuleDetail,
  fetchModules,
  searchDocuments,
} from '../services/api';
import {
  DocumentDetail,
  DocumentRow,
  FaqDetail,
  FaqRow,
  FolderRow,
  ModuleRow,
} from '../types/mims';
import { mobileColors } from '../theme/colors';
import { formatDateTime, stripHtml, summarizeText } from '../utils/format';

type ContentScreenProps = {
  token: string;
};

type ContentMode = 'documents' | 'faqs' | 'modules';

export function ContentScreen({ token }: ContentScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ContentMode>('documents');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [faqsTotal, setFaqsTotal] = useState(0);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<{
    id: number;
    kind: ContentMode;
    title: string;
  } | null>(null);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null);
  const [faqDetail, setFaqDetail] = useState<FaqDetail | null>(null);
  const [moduleDetail, setModuleDetail] = useState<(ModuleRow & Record<string, unknown>) | null>(null);

  useEffect(() => {
    void loadFolders();
  }, []);

  useEffect(() => {
    void loadCurrentMode();
  }, [mode, page, folderId, search]);

  useEffect(() => {
    if (!selectedItem) return;
    void loadDetail(selectedItem);
  }, [selectedItem]);

  async function loadFolders() {
    try {
      const payload = await fetchFolders(token);
      setFolders(payload.folders || []);
    } catch (_) {
      // non-blocking for mobile browse
    }
  }

  async function loadCurrentMode() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'documents') {
        if (search.trim().length >= 2) {
          const payload = await searchDocuments(token, search.trim());
          setDocuments((payload.documents || []) as DocumentRow[]);
          setDocumentsTotal((payload.documents || []).length);
        } else {
          const payload = await fetchDocuments(token, { folderId, page, limit: 12, search: search.trim() || undefined });
          setDocuments(payload.documents || []);
          setDocumentsTotal(Number(payload.total || 0));
        }
      } else if (mode === 'faqs') {
        const payload = await fetchFaqs(token, { folderId, page, limit: 12, search: search.trim() || undefined });
        setFaqs(payload.faqs || []);
        setFaqsTotal(Number(payload.total || 0));
      } else {
        const payload = await fetchModules(token, { folderId, search: search.trim() || undefined });
        setModules(payload.modules || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(item: { id: number; kind: ContentMode; title: string }) {
    setLoading(true);
    setError(null);
    try {
      if (item.kind === 'documents') {
        setDocumentDetail(await fetchDocumentDetail(token, item.id));
      } else if (item.kind === 'faqs') {
        setFaqDetail(await fetchFaqDetail(token, item.id));
      } else {
        const payload = await fetchModuleDetail(token, item.id);
        setModuleDetail(payload.module);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content detail.');
    } finally {
      setLoading(false);
    }
  }

  const totalPages =
    mode === 'documents'
      ? Math.max(1, Math.ceil(documentsTotal / 12))
      : mode === 'faqs'
        ? Math.max(1, Math.ceil(faqsTotal / 12))
        : 1;

  if (selectedItem) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Content detail</Text>
            <Text style={styles.title}>{selectedItem.title}</Text>
          </View>
          <Pressable
            onPress={() => {
              setSelectedItem(null);
              setDocumentDetail(null);
              setFaqDetail(null);
              setModuleDetail(null);
            }}
          >
            <Text style={styles.refreshLink}>Back to browse</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {loading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}

        {documentDetail ? (
          <>
            <SectionCard title="Document summary">
              <DetailRow label="Document ID" value={String(documentDetail.document.doc_id || 'N/A')} />
              <DetailRow label="Status" value={String(documentDetail.document.status || 'Unknown')} />
              <DetailRow label="Folder" value={String(documentDetail.document.folder_name || 'Unknown')} />
              <DetailRow label="Updated" value={formatDateTime(String(documentDetail.document.updated_at || ''))} />
            </SectionCard>
            <SectionCard title="Body">
              <Text style={styles.bodyText}>
                {summarizeText(
                  String(
                    documentDetail.document.assembled_html ||
                      documentDetail.document.content_html ||
                      ''
                  ),
                  1200
                )}
              </Text>
            </SectionCard>
          </>
        ) : null}

        {faqDetail ? (
          <>
            <SectionCard title="FAQ summary">
              <DetailRow label="Category" value={String(faqDetail.faq.category || 'General')} />
              <DetailRow label="Folder" value={String(faqDetail.faq.folder_name || 'Unknown')} />
              <DetailRow label="Updated" value={formatDateTime(String(faqDetail.faq.updated_at || ''))} />
            </SectionCard>
            <SectionCard title="Answer">
              <Text style={styles.bodyText}>{stripHtml(String(faqDetail.faq.answer_html || '')) || 'No answer text.'}</Text>
            </SectionCard>
          </>
        ) : null}

        {moduleDetail ? (
          <>
            <SectionCard title="Module summary">
              <DetailRow label="Module ID" value={String(moduleDetail.module_id || 'N/A')} />
              <DetailRow label="Folder" value={String(moduleDetail.folder_name || 'Unknown')} />
              <DetailRow label="Status" value={String(moduleDetail.status || 'Unknown')} />
              <DetailRow label="Updated" value={formatDateTime(String(moduleDetail.updated_at || ''))} />
            </SectionCard>
            <SectionCard title="Content">
              <Text style={styles.bodyText}>{summarizeText(String(moduleDetail.content_html || ''), 1200)}</Text>
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
          <Text style={styles.eyebrow}>Content</Text>
          <Text style={styles.title}>Documents, FAQs, and modules</Text>
        </View>
        <Text onPress={() => void loadCurrentMode()} style={styles.refreshLink}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <SearchField onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="Search content" value={search} />

      <View style={styles.filterWrap}>
        {(['documents', 'faqs', 'modules'] as ContentMode[]).map((item) => (
          <FilterChip
            active={mode === item}
            key={item}
            label={item}
            onPress={() => {
              setMode(item);
              setPage(1);
            }}
          />
        ))}
      </View>

      <SectionCard title="Folders">
        <View style={styles.filterWrap}>
          <FilterChip active={folderId === null} label="All folders" onPress={() => setFolderId(null)} />
          {folders.slice(0, 8).map((item) => (
            <FilterChip
              active={folderId === item.id}
              key={item.id}
              label={item.name}
              onPress={() => setFolderId(item.id)}
            />
          ))}
        </View>
      </SectionCard>

      {mode !== 'modules' ? (
        <View style={styles.paginationRow}>
          <Pressable disabled={page === 1} onPress={() => setPage((current) => Math.max(1, current - 1))}>
            <Text style={[styles.refreshLink, page === 1 ? styles.mutedLink : null]}>Previous</Text>
          </Pressable>
          <Text style={styles.pageText}>
            {page} / {totalPages}
          </Text>
          <Pressable disabled={page >= totalPages} onPress={() => setPage((current) => current + 1)}>
            <Text style={[styles.refreshLink, page >= totalPages ? styles.mutedLink : null]}>Next</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionCard title={mode === 'documents' ? 'Documents' : mode === 'faqs' ? 'FAQs' : 'Modules'}>
        {loading ? <ActivityIndicator color="#1d4ed8" size="large" /> : null}
        {mode === 'documents'
          ? documents.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedItem({ id: item.id, kind: 'documents', title: item.name })} style={styles.listCard}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listMeta}>
                  {item.folder_name || 'Unknown folder'} · {item.status || 'Unknown'}
                </Text>
                <Text style={styles.listMeta}>{formatDateTime(item.updated_at)}</Text>
              </Pressable>
            ))
          : null}
        {mode === 'faqs'
          ? faqs.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedItem({ id: item.id, kind: 'faqs', title: item.question })} style={styles.listCard}>
                <Text style={styles.listTitle}>{item.question}</Text>
                <Text style={styles.listMeta}>
                  {item.category || 'General'} · {item.folder_name || 'Unknown folder'}
                </Text>
                <Text style={styles.listMeta}>{formatDateTime(item.updated_at)}</Text>
              </Pressable>
            ))
          : null}
        {mode === 'modules'
          ? modules.map((item) => (
              <Pressable key={item.id} onPress={() => setSelectedItem({ id: item.id, kind: 'modules', title: item.name })} style={styles.listCard}>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listMeta}>
                  {item.folder_name || 'Unknown folder'} · {item.status || 'Unknown'}
                </Text>
                <Text style={styles.listMeta}>{summarizeText(item.content_html, 120)}</Text>
              </Pressable>
            ))
          : null}
      </SectionCard>
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
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  listCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    gap: 6,
    padding: 14,
  },
  listTitle: {
    color: mobileColors.textStrong,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  listMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
  bodyText: {
    color: mobileColors.textStrong,
    fontSize: 14,
    lineHeight: 21,
  },
});
