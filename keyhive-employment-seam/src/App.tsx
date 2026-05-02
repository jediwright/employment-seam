import { useDocument } from '@automerge/automerge-repo-react-hooks'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { WorkerKnowledgeGraph, Decision } from './types'

function TypeResolutionTest({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<WorkerKnowledgeGraph>(docUrl)

  const testMutation = () => {
    // AM-1: all mutations go through changeDoc
    changeDoc((d) => {
      // Test 1: append a Decision onto decisions[]
      const decision: Decision = {
        decisionId: crypto.randomUUID(),
        projectId: 'test-project',
        title: 'Test Decision',
        context: 'FM-3 type resolution test',
        outcome: 'Types resolve correctly',
        rationale: 'Compile-time verification',
        madeAt: new Date().toISOString(),
        participants: [],
        createdAt: new Date().toISOString(),
      }
      d.decisions.push(decision)

      // Test 2: assign an optional field
      const handoffId = 'test-handoff'
      if (d.handoffs[handoffId]) {
        d.handoffs[handoffId].completedAt = new Date().toISOString()
      }

      // Test 3: read identity.createdAt (compile-time check)
      const _createdAt: string = d.identity.createdAt
      void _createdAt
    })
  }

  return (
    <div>
      <p>createdAt: {doc?.identity.createdAt ?? 'loading...'}</p>
      <button onClick={testMutation}>Run FM-3 Test</button>
    </div>
  )
}

export default TypeResolutionTest