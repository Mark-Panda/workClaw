import { useState, useEffect, useCallback, useRef } from 'react';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import * as skillsApi from '../../api/skills';
import type { SkillItem } from '../../api/skills';

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [contentModal, setContentModal] = useState<{ name: string; content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skillsApi.listSkills();
      console.log('skills list:', res);
      setSkills(res.skills);
    } catch (err) {
      console.error('list skills error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      alert('仅支持上传 ZIP 文件');
      return;
    }

    setUploading(true);
    try {
      const result = await skillsApi.uploadSkill(file);
      console.log('upload result:', result);
      await loadSkills();
    } catch (err: any) {
      console.error('upload error:', err);
      alert(err?.response?.status === 400 ? '上传失败：文件格式或内容不正确' : '上传失败');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleViewContent = async (name: string) => {
    try {
      const res = await skillsApi.getSkillContent(name);
      setContentModal(res);
    } catch {
      alert('获取内容失败');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await skillsApi.deleteSkill(deleteTarget);
      loadSkills();
    } catch {
      alert('删除失败');
    }
    setDeleteTarget(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">技能管理</h1>
        <div className="flex items-center gap-3">
          <Button onClick={() => fileInputRef.current?.click()}>
            {uploading ? '上传中...' : '上传技能 (ZIP)'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">加载中...</div>
      ) : skills.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          尚未上传任何技能，请点击上方按钮上传 ZIP 包。
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((s) => (
            <div key={s.name} className="card flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.name}</div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.description || '无描述'} · v{s.version} · {formatSize(s.size)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1"
                  onClick={() => handleViewContent(s.name)}
                >
                  查看
                </button>
                <button
                  className="text-xs text-gray-400 hover:text-red-600 px-2 py-1"
                  onClick={() => setDeleteTarget(s.name)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={contentModal !== null}
        onClose={() => setContentModal(null)}
        title={`技能内容: ${contentModal?.name ?? ''}`}
      >
        <pre className="bg-gray-50 p-4 rounded-md text-sm whitespace-pre-wrap max-h-96 overflow-auto">
          {contentModal?.content ?? ''}
        </pre>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除技能"
        message={`确定要删除技能「${deleteTarget}」吗？此操作不可撤销，将删除整个技能目录。`}
        confirmLabel="删除"
      />
    </div>
  );
}
