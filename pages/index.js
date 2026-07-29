import { useEffect, useMemo, useState } from 'react';

export default function AdminDashboard() {
  const [tab, setTab] = useState('knowledge'); // 'knowledge' | 'categories' | 'unanswered' | 'test'
  const [knowledge, setKnowledge] = useState([]);
  const [categories, setCategories] = useState([]);
  const [unanswered, setUnanswered] = useState([]);
  const [allUnansweredCount, setAllUnansweredCount] = useState({ total: 0, resolved: 0 });
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null); // { message, type }

  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  const [form, setForm] = useState({
    title: '', content: '', categoryId: '', keywords: '',
    requiredGroups: '', excludeKeywords: '', minConfidence: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  function notify(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadData() {
    const [kRes, cRes, uRes, allURes] = await Promise.all([
      fetch('/api/knowledge'),
      fetch('/api/knowledge/categories'),
      fetch('/api/unanswered?resolved=false'),
      fetch('/api/unanswered'),
    ]);
    setKnowledge(await kRes.json());
    setCategories(await cRes.json());
    setUnanswered(await uRes.json());

    const all = await allURes.json();
    setAllUnansweredCount({
      total: all.length,
      resolved: all.filter((q) => q.resolved).length,
    });
  }

  useEffect(() => { loadData(); }, []);

  const filteredKnowledge = useMemo(() => {
    if (!search.trim()) return knowledge;
    const q = search.toLowerCase();
    return knowledge.filter((k) =>
      k.title.toLowerCase().includes(q) ||
      k.content.toLowerCase().includes(q) ||
      k.keywords.some((kw) => kw.keyword.toLowerCase().includes(q))
    );
  }, [knowledge, search]);

  const stats = useMemo(() => {
    const totalAnswered = knowledge.reduce((sum, k) => sum + (k.matchCount || 0), 0);
    const topKnowledge = [...knowledge]
      .filter((k) => k.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5);
    const maxCount = topKnowledge[0]?.matchCount || 1;

    const totalQuestions = totalAnswered + allUnansweredCount.total;
    const successRate = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;

    return { totalAnswered, topKnowledge, maxCount, successRate, totalQuestions };
  }, [knowledge, allUnansweredCount]);

  function resetForm() {
    setForm({ title: '', content: '', categoryId: '', keywords: '', requiredGroups: '', excludeKeywords: '', minConfidence: '' });
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const requiredGroups = form.requiredGroups
      .split('\n')
      .map((line) => line.split(',').map((t) => t.trim()).filter(Boolean))
      .filter((group) => group.length > 0);

    const excludeKeywords = form.excludeKeywords.split(',').map((k) => k.trim()).filter(Boolean);

    const payload = {
      title: form.title,
      content: form.content,
      categoryId: form.categoryId,
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      requiredGroups,
      excludeKeywords,
      minConfidence: form.minConfidence.trim() === '' ? null : Number(form.minConfidence),
    };

    const url = editingId ? `/api/knowledge/${editingId}` : '/api/knowledge';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      notify('Gagal menyimpan knowledge', 'error');
      return;
    }

    notify(editingId ? 'Knowledge berhasil diperbarui' : 'Knowledge baru ditambahkan');
    resetForm();
    loadData();
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setShowForm(true);
    setForm({
      title: item.title,
      content: item.content,
      categoryId: String(item.categoryId),
      keywords: item.keywords.map((k) => k.keyword).join(', '),
      requiredGroups: Array.isArray(item.requiredGroups)
        ? item.requiredGroups.map((g) => g.join(', ')).join('\n') : '',
      excludeKeywords: Array.isArray(item.excludeKeywords) ? item.excludeKeywords.join(', ') : '',
      minConfidence: typeof item.minConfidence === 'number' ? String(item.minConfidence) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id) {
    if (!confirm('Hapus knowledge ini?')) return;
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    notify('Knowledge dihapus');
    loadData();
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    await fetch('/api/knowledge/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategory.trim() }),
    });
    setNewCategory('');
    notify('Kategori ditambahkan');
    loadData();
  }

  function startEditCategory(cat) {
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
  }
  function cancelEditCategory() {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  }

  async function handleUpdateCategory(e) {
    e.preventDefault();
    if (!editingCategoryName.trim()) return;
    const res = await fetch(`/api/knowledge/categories/${editingCategoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingCategoryName.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      notify(data.error || 'Gagal update kategori', 'error');
      return;
    }
    notify('Kategori diperbarui');
    cancelEditCategory();
    loadData();
  }

  async function handleDeleteCategory(cat) {
    if (!confirm(`Hapus kategori "${cat.name}"?`)) return;
    const res = await fetch(`/api/knowledge/categories/${cat.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      notify(data.error || 'Gagal hapus kategori', 'error');
      return;
    }
    notify('Kategori dihapus');
    loadData();
  }

  async function handleResolveUnanswered(id) {
    await fetch('/api/unanswered', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: true }),
    });
    notify('Ditandai sudah ditindaklanjuti');
    loadData();
  }

  async function handleDeleteUnanswered(id) {
    await fetch(`/api/unanswered?id=${id}`, { method: 'DELETE' });
    loadData();
  }

  function handleCreateFromQuery(query) {
    setTab('knowledge');
    setShowForm(true);
    setEditingId(null);
    setForm({
      title: '',
      content: '',
      categoryId: '',
      keywords: query.message,
      requiredGroups: '',
      excludeKeywords: '',
      minConfidence: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleTestBot(e) {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testQuery }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      notify('Gagal menjalankan test', 'error');
    } finally {
      setTestLoading(false);
    }
  }

  async function handleResetStats(target, label) {
    if (!confirm(`Reset ${label}? Data yang sudah dihapus tidak bisa dikembalikan.`)) return;

    await fetch('/api/reset-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });

    notify(`${label} berhasil direset`);
    loadData();
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div>
          <h1>English Hive — Knowledge Base</h1>
          <p>Kelola jawaban bot WhatsApp tanpa sentuh kode</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'knowledge' ? 'active' : ''}`} onClick={() => setTab('knowledge')}>
          Knowledge ({knowledge.length})
        </button>
        <button className={`tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>
          Kategori ({categories.length})
        </button>
        <button className={`tab ${tab === 'unanswered' ? 'active' : ''}`} onClick={() => setTab('unanswered')}>
          Belum Terjawab ({unanswered.length})
        </button>
        <button className={`tab ${tab === 'test' ? 'active' : ''}`} onClick={() => setTab('test')}>
          🧪 Test Bot
        </button>
        <button className={`tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
          📊 Statistik
        </button>
      </div>

      {tab === 'knowledge' && (
        <>
          {!showForm && (
            <button className="btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
              + Tambah Knowledge
            </button>
          )}

          {showForm && (
            <div className="card">
              <h3>{editingId ? 'Edit Knowledge' : 'Tambah Knowledge Baru'}</h3>
              <form onSubmit={handleSubmit}>
                <input
                  placeholder="Judul (mis. Jam Operasional)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <textarea
                  placeholder="Isi jawaban yang akan dikirim ke user"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                />
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  required
                >
                  <option value="">Pilih kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <label className="field-label">Keyword (OR — cukup salah satu cocok)</label>
                <input
                  placeholder="jam buka, jam operasional"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                />

                <label className="field-label">Kombinasi Wajib (AND — 1 baris = 1 kombinasi)</label>
                <textarea
                  placeholder={'jadwal, hari\njadwal, jam'}
                  value={form.requiredGroups}
                  onChange={(e) => setForm({ ...form, requiredGroups: e.target.value })}
                  style={{ minHeight: 56 }}
                />
                <p className="hint">Match kalau SEMUA kata dalam 1 baris muncul bersamaan di pesan user.</p>

                <label className="field-label">Kata Terlarang (exclude)</label>
                <input
                  placeholder="pindah, ganti, reschedule"
                  value={form.excludeKeywords}
                  onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })}
                />
                <p className="hint">Kalau kata ini muncul di pesan user, knowledge ini otomatis di-skip.</p>

                <label className="field-label">Threshold Khusus (opsional)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  placeholder="Kosongkan untuk pakai default (0.35)"
                  value={form.minConfidence}
                  onChange={(e) => setForm({ ...form, minConfidence: e.target.value })}
                />
                <p className="hint">
                  Makin tinggi = bot makin hati-hati (butuh lebih yakin sebelum jawab).
                  Cocok untuk knowledge sensitif seperti harga/kontrak (isi 0.5–0.6).
                  Biarkan kosong untuk knowledge biasa.
                </p>

                <div className="btn-row">
                  <button type="submit">{editingId ? 'Simpan Perubahan' : 'Tambah Knowledge'}</button>
                  <button type="button" className="secondary" onClick={resetForm}>Batal</button>
                </div>
              </form>
            </div>
          )}

          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Cari judul, isi, atau keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredKnowledge.length === 0 && (
            <div className="empty">
              {search ? 'Tidak ada knowledge yang cocok dengan pencarian.' : 'Belum ada knowledge. Tambahkan yang pertama di atas.'}
            </div>
          )}

          {filteredKnowledge.map((item) => (
            <div className="k-item" key={item.id}>
              <div className="k-item-head">
                <div className="k-title">{item.title}</div>
                <div className="btn-row" style={{ margin: 0, flexShrink: 0 }}>
                  <button className="secondary" onClick={() => handleEdit(item)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(item.id)}>Hapus</button>
                </div>
              </div>
              <div className="k-content">{item.content}</div>
              <div className="tag-row">
                <span className="tag tag-cat">{item.category?.name}</span>
                {item.keywords.map((k) => (
                  <span className="tag tag-kw" key={k.id}>{k.keyword}</span>
                ))}
                {typeof item.minConfidence === 'number' && (
                  <span className="tag" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                    Threshold: {item.minConfidence}
                  </span>
                )}
              </div>
              {Array.isArray(item.requiredGroups) && item.requiredGroups.length > 0 && (
                <div className="tag-row">
                  {item.requiredGroups.map((group, i) => (
                    <span className="tag tag-and" key={i}>AND: {group.join(' + ')}</span>
                  ))}
                </div>
              )}
              {Array.isArray(item.excludeKeywords) && item.excludeKeywords.length > 0 && (
                <div className="tag-row">
                  {item.excludeKeywords.map((k, i) => (
                    <span className="tag tag-exclude" key={i}>EXCLUDE: {k}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'categories' && (
        <div className="card">
          <h3>Tambah Kategori</h3>
          <form onSubmit={handleAddCategory} className="row">
            <input
              placeholder="Nama kategori baru"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button type="submit">Tambah</button>
          </form>

          <div style={{ marginTop: 18 }}>
            {categories.length === 0 && <div className="empty">Belum ada kategori.</div>}
            {categories.map((cat) => (
              <div className="cat-item" key={cat.id}>
                {editingCategoryId === cat.id ? (
                  <form onSubmit={handleUpdateCategory} className="row" style={{ flex: 1 }}>
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      autoFocus
                    />
                    <button type="submit">Simpan</button>
                    <button type="button" className="secondary" onClick={cancelEditCategory}>Batal</button>
                  </form>
                ) : (
                  <>
                    <strong>{cat.name}</strong>
                    <div className="btn-row" style={{ margin: 0 }}>
                      <button className="secondary" onClick={() => startEditCategory(cat)}>Edit</button>
                      <button className="danger" onClick={() => handleDeleteCategory(cat)}>Hapus</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'unanswered' && (
        <div className="card">
          <h3>Pertanyaan Belum Terjawab</h3>
          <p className="hint" style={{ marginBottom: 16 }}>
            Pesan yang gagal dijawab bot (tidak match / ambigu). Cek pola pertanyaan asli
            customer di sini, lalu buatkan knowledge baru berdasarkan bahasa mereka sendiri.
          </p>

          {unanswered.length === 0 && (
            <div className="empty">🎉 Tidak ada pertanyaan yang belum terjawab saat ini.</div>
          )}

          {unanswered.map((q) => (
            <div className="k-item" key={q.id}>
              <div className="k-item-head">
                <div>
                  <div className="k-title">"{q.message}"</div>
                  <p className="hint" style={{ marginTop: 4 }}>
                    {new Date(q.createdAt).toLocaleString('id-ID')} · {q.reason === 'no_match' ? 'Tidak ketemu' : 'Confidence rendah'}
                  </p>
                </div>
                <div className="btn-row" style={{ margin: 0, flexShrink: 0 }}>
                  <button className="btn-primary" onClick={() => handleCreateFromQuery(q)}>Buat Knowledge</button>
                  <button className="secondary" onClick={() => handleResolveUnanswered(q.id)}>Selesai</button>
                  <button className="danger" onClick={() => handleDeleteUnanswered(q.id)}>Hapus</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'test' && (
        <div className="card">
          <h3>Test Bot</h3>
          <p className="hint" style={{ marginBottom: 16 }}>
            Simulasikan pertanyaan seperti dari WhatsApp, lihat knowledge mana yang
            kepilih dan skor confidence-nya -- tanpa perlu kirim pesan WhatsApp beneran.
          </p>

          <form onSubmit={handleTestBot} className="row">
            <input
              placeholder='Ketik pertanyaan test, mis. "jadwal kelas hari apa"'
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
            />
            <button type="submit" disabled={testLoading}>
              {testLoading ? 'Menguji...' : 'Test'}
            </button>
          </form>

          {testResult && (
            <div style={{ marginTop: 20 }}>
              <div className="k-item" style={{ borderColor: testResult.matched ? '#16a34a' : '#dc2626' }}>
                <div className="k-item-head">
                  <div className="k-title">
                    {testResult.matched ? '✅ Match ditemukan' : '❌ Tidak ada yang match'}
                  </div>
                  <span
                    className="tag"
                    style={{
                      background: testResult.matched ? '#ecfdf3' : '#fef2f2',
                      color: testResult.matched ? '#15803d' : '#b91c1c',
                    }}
                  >
                    Confidence: {testResult.confidence} (threshold: {testResult.knowledge?.minConfidence ?? testResult.threshold})
                  </span>
                </div>

                {testResult.knowledge && (
                  <>
                    <p className="hint" style={{ fontSize: 13, marginTop: 8 }}>
                      Knowledge: <strong>{testResult.knowledge.title}</strong> ({testResult.knowledge.category})
                    </p>
                    <div className="k-content">{testResult.knowledge.content}</div>
                  </>
                )}

                {!testResult.matched && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    Bot akan diam untuk pesan ini di WhatsApp asli. Coba perbaiki keyword/AND-group
                    di knowledge yang seharusnya menjawab pertanyaan ini.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Sora, sans-serif', color: '#15803d' }}>
                {stats.totalQuestions}
              </div>
              <p className="hint">Total pertanyaan masuk</p>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Sora, sans-serif', color: '#15803d' }}>
                {stats.successRate}%
              </div>
              <p className="hint">Tingkat berhasil dijawab</p>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Sora, sans-serif', color: '#dc2626' }}>
                {unanswered.length}
              </div>
              <p className="hint">Belum ditindaklanjuti</p>
            </div>
          </div>

          <div className="card">
            <h3>Knowledge Paling Sering Dijawab</h3>
            {stats.topKnowledge.length === 0 && (
              <div className="empty">Belum ada data. Statistik akan muncul setelah bot mulai menjawab pesan.</div>
            )}
            {stats.topKnowledge.map((k) => (
              <div key={k.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4 }}>
                  <strong style={{ color: 'var(--navy)' }}>{k.title}</strong>
                  <span className="hint">{k.matchCount}x</span>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max((k.matchCount / stats.maxCount) * 100, 4)}%`,
                      background: 'linear-gradient(90deg, #16a34a, #15803d)',
                      height: '100%',
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Log Pertanyaan Gagal</h3>
            <p className="hint">
              Total sepanjang waktu: <strong>{allUnansweredCount.total}</strong> pertanyaan gagal dijawab,
              {' '}<strong>{allUnansweredCount.resolved}</strong> di antaranya sudah ditindaklanjuti
              ({allUnansweredCount.total > 0 ? Math.round((allUnansweredCount.resolved / allUnansweredCount.total) * 100) : 0}%).
            </p>
          </div>

          <div className="card">
            <h3>⚠️ Reset Data Statistik</h3>
            <p className="hint" style={{ marginBottom: 14 }}>
              Tindakan ini permanen dan tidak bisa dibatalkan. Knowledge base (judul, isi,
              keyword) TIDAK akan terhapus -- hanya angka statistiknya saja yang direset ke 0.
            </p>
            <div className="btn-row" style={{ flexWrap: 'wrap' }}>
              <button className="danger" onClick={() => handleResetStats('matchCount', 'Statistik "sering dijawab"')}>
                Reset Popularitas Knowledge
              </button>
              <button className="danger" onClick={() => handleResetStats('unanswered', 'Log pertanyaan gagal')}>
                Reset Log Pertanyaan Gagal
              </button>
              <button className="danger" onClick={() => handleResetStats('all', 'SEMUA statistik')}>
                Reset Semua Statistik
              </button>
            </div>
          </div>
        </>
      )}

      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  );
}