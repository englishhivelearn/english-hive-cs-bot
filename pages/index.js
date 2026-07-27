import { useEffect, useMemo, useState } from 'react';

export default function AdminDashboard() {
  const [tab, setTab] = useState('knowledge'); // 'knowledge' | 'categories'
  const [knowledge, setKnowledge] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null); // { message, type }

  const [form, setForm] = useState({
    title: '', content: '', categoryId: '', keywords: '',
    requiredGroups: '', excludeKeywords: '',
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
    const [kRes, cRes] = await Promise.all([
      fetch('/api/knowledge'),
      fetch('/api/knowledge/categories'),
    ]);
    setKnowledge(await kRes.json());
    setCategories(await cRes.json());
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

  function resetForm() {
    setForm({ title: '', content: '', categoryId: '', keywords: '', requiredGroups: '', excludeKeywords: '' });
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

      {toast && <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>{toast.message}</div>}
    </div>
  );
}