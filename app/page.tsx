import SportPeekApp from "@/components/SportPeekApp";
import { isPublicSignupAllowed } from "@/lib/config";
import { getInitialData } from "@/lib/application/ssr-data";

export default async function Home() {
  const initialData = await getInitialData("/");
  return <SportPeekApp route="/" signupAllowed={isPublicSignupAllowed()} initialData={initialData} />;
}
