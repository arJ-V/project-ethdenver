export default function TerminalLoading() {
  return (
    <div className="flex flex-col h-screen items-center justify-center bg-background text-foreground">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="mt-4 text-sm text-muted-foreground">Loading terminal…</p>
    </div>
  )
}
