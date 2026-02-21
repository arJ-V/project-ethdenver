"use client"

import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class TerminalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex flex-col h-screen items-center justify-center p-8 bg-background text-foreground">
          <h1 className="text-lg font-headline font-bold text-destructive">Something went wrong</h1>
          <pre className="mt-4 p-4 rounded bg-muted text-xs overflow-auto max-w-2xl">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-6 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
