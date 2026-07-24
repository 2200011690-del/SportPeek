import { createAdminClient } from "../lib/supabase/admin";

try { process.loadEnvFile?.(".env.local"); } catch {}

async function reset() {
  const client = createAdminClient();
  if (!client) {
    console.error("Supabase client not configured");
    return;
  }
  
  console.log("Resetting stories database...");
  
  const { error: err1 } = await client.from("story_cluster_articles").delete().neq("cluster_id", "00000000-0000-0000-0000-000000000000");
  if (err1) console.error("Error deleting story_cluster_articles:", err1);
  
  const { error: err2 } = await client.from("story_timeline").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err2) console.error("Error deleting story_timeline:", err2);
  
  const { error: err3 } = await client.from("story_entities").delete().neq("cluster_id", "00000000-0000-0000-0000-000000000000");
  if (err3) console.error("Error deleting story_entities:", err3);
  
  const { error: err4 } = await client.from("story_clusters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (err4) console.error("Error deleting story_clusters:", err4);
  
  const { error: err5 } = await client.from("raw_articles").update({ processing_status: "pending" }).neq("processing_status", "pending");
  if (err5) console.error("Error updating raw_articles:", err5);
  
  console.log("Database reset completed successfully! Raw articles are now 'pending'.");
}

reset().catch(console.error);
