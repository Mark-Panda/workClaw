import client from './client';

export interface SkillItem {
  name: string;
  description: string;
  version: string;
  size: number;
}

export async function listSkills(): Promise<{ skills: SkillItem[] }> {
  const res = await client.get('/skills');
  return res.data;
}

export async function uploadSkill(file: File): Promise<{ name: string; ok: boolean }> {
  const res = await client.post('/skills', file, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Skill-Name': file.name,
    },
  });
  return res.data;
}

export async function deleteSkill(name: string): Promise<void> {
  await client.delete(`/skills/${encodeURIComponent(name)}`);
}

export async function getSkillContent(name: string): Promise<{ name: string; content: string }> {
  const res = await client.get(`/skills/${encodeURIComponent(name)}/content`);
  return res.data;
}
