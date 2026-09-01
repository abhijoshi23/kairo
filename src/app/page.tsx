import Chat from "@/components/Chat";

// A Server Component: it renders on the server and ships no JS of its own.
// The interactive part is <Chat/>, which opts in to the client with "use client".
export default function Home() {
  return <Chat />;
}
