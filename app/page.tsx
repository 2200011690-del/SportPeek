import SportPeekApp from "@/components/SportPeekApp";
import { isPublicSignupAllowed } from "@/lib/config";

export default function Home() {
  return <SportPeekApp route="/" signupAllowed={isPublicSignupAllowed()} />;
}
