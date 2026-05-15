import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';

export default function RuleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dslJson, setDslJson] = useState(`{
  "chain_id": "",
  "version": "1.0",
  "nodes": [
    {"id": "start", "type": "start", "config": {}},
    {"id": "end", "type": "end", "config": {}}
  ],
  "edges": [{"from": "start", "to": "end"}],
  "interceptors": []
}`);
  const [viewMode, setViewMode] = useState<'visual' | 'json'>('json');

  const handleSave = () => {
    // TODO: Save rule via API
    navigate('/rules');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {isNew ? 'New Rule' : 'Edit Rule'}
        </h1>
        <div className="flex gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'visual' ? 'bg-primary-600 text-white' : 'bg-white'}`}
            >
              Visual
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'json' ? 'bg-primary-600 text-white' : 'bg-white'}`}
            >
              JSON
            </button>
          </div>
          <Button onClick={handleSave}>{isNew ? 'Create' : 'Save'}</Button>
          <Button variant="secondary" onClick={() => navigate('/rules')}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule chain name"
          className="input-field max-w-md"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="input-field max-w-md mt-2"
        />
      </div>

      {viewMode === 'visual' ? (
        <div className="card h-[500px] flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="text-lg mb-2">Visual Rule Editor</p>
            <p className="text-sm">
              Flowgram.ai canvas integration coming in Phase 6.
              <br />
              Switch to JSON mode for now.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <textarea
            value={dslJson}
            onChange={(e) => setDslJson(e.target.value)}
            className="w-full h-[500px] font-mono text-sm p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
