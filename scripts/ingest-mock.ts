import { runIngestion } from "../lib/ingestion/index";
const result = await runIngestion();
console.log(JSON.stringify(result, null, 2));
