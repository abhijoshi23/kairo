import Chat from "@/components/Chat";
import { OWNER_NAME } from "@/lib/persona/profile";

// A Server Component: it renders on the server and ships no JS of its own.
// The interactive part is <Chat/>, which opts in to the client with "use client".
export default function Home() {
  return <Chat ownerName={OWNER_NAME} />;
}
