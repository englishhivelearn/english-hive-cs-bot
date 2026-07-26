import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [knowledge, setKnowledge] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: '', content: '', categoryId: '', keywords: '' });
  const [editingId, setEditingId] = useState(null);
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  async function loadData() {
    const [kRes, cRes] = await Promise.all([
      fetch('/api/knowledge'),
      fetch('/api/knowledge/categories'),
    ]);
    setKnowledge(await kRes.json());
    setCategories(await cRes.json());
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      title: form.title,
      content: form.content,
      categoryId: form.categoryId,
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    };

    const url = editingId ? `/api/knowledge/${editingId}` : '/api/knowledge';
    const method = editingId ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setForm({ title: '', content: '', categoryId: '', keywords: '' });
    setEditingId(null);
    loadData();
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      categoryId: String(item.categoryId),
      keywords: item.keywords.map((k) => k.keyword).join(', '),
    });
  }

  async function handleDelete(id) {
    if (!confirm('Hapus knowledge ini?')) return;
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
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
      alert(data.error || 'Gagal update kategori');
      return;
    }

    cancelEditCategory();
    loadData();
  }

  async function handleDeleteCategory(cat) {
    if (!confirm(`Hapus kategori "${cat.name}"?`)) return;

    const res = await fetch(`/api/knowledge/categories/${cat.id}`, { method: 'DELETE' });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Gagal hapus kategori');
      return;
    }

    loadData();
  }

  return (
    <div className="container">
      <h1>English Hive — Knowledge Base Admin</h1>
      <p className="subtitle">Kelola jawaban bot WhatsApp tanpa perlu ubah kode.</p>

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
          <input
            placeholder="Keyword, pisahkan dengan koma (mis. jam buka, jam operasional)"
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">{editingId ? 'Simpan Perubahan' : 'Tambah'}</button>
            {editingId && (
              <button
                type="button"
                className="secondary"
                onClick={() => { setEditingId(null); setForm({ title: '', content: '', categoryId: '', keywords: '' }); }}
              >
                Batal
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Tambah Kategori</h3>
        <form onSubmit={handleAddCategory} style={{ flexDirection: 'row' }}>
          <input
            placeholder="Nama kategori baru"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit">Tambah Kategori</button>
        </form>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <h4 style={{ margin: '0 0 8px' }}>Daftar Kategori ({categories.length})</h4>
        {categories.length === 0 && <p style={{ color: '#888' }}>Belum ada kategori.</p>}
        {categories.map((cat) => (
          <div className="list-item" key={cat.id}>
            {editingCategoryId === cat.id ? (
              <form onSubmit={handleUpdateCategory} style={{ flexDirection: 'row', flex: 1, gap: 8 }}>
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary" onClick={() => startEditCategory(cat)}>Edit</button>
                  <button className="danger" onClick={() => handleDeleteCategory(cat)}>Hapus</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Daftar Knowledge ({knowledge.length})</h3>
        {knowledge.map((item) => (
          <div className="list-item" key={item.id}>
            <div>
              <strong>{item.title}</strong>{' '}
              <span className="tag">{item.category?.name}</span>
              <p style={{ margin: '4px 0', color: '#444' }}>{item.content}</p>
              <div>
                {item.keywords.map((k) => (
                  <span className="tag" key={k.id}>{k.keyword}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="secondary" onClick={() => handleEdit(item)}>Edit</button>
              <button className="danger" onClick={() => handleDelete(item.id)}>Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}