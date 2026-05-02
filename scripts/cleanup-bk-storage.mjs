import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const BK_SCHOOL_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'updates-media';

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function listAll(prefix) {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      if (item.id) out.push(`${prefix}/${item.name}`);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function main() {
  const { data: bkPosts, error: postErr } = await supabase
    .from('parent_updates')
    .select('id')
    .eq('school_id', BK_SCHOOL_ID);
  if (postErr) throw postErr;
  console.log(`Found ${bkPosts.length} BK parent_updates posts`);

  const filesToDelete = [];

  for (const post of bkPosts) {
    const files = await listAll(post.id);
    console.log(`  post ${post.id}: ${files.length} file(s)`);
    filesToDelete.push(...files);
  }

  const receiptFiles = await listAll(`payment-receipts/${BK_SCHOOL_ID}`);
  console.log(`payment-receipts/${BK_SCHOOL_ID}: ${receiptFiles.length} file(s)`);
  filesToDelete.push(...receiptFiles);

  if (filesToDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(`\nDeleting ${filesToDelete.length} object(s):`);
  for (const f of filesToDelete) console.log(`  ${f}`);

  const batchSize = 100;
  for (let i = 0; i < filesToDelete.length; i += batchSize) {
    const batch = filesToDelete.slice(i, i + batchSize);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    console.log(`Deleted batch (${data.length} objects)`);
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
