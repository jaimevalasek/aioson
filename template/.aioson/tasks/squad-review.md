# Task: Squad Review Loop

> Review-loop protocol inside a workflow phase.

## When To Use
- Automatically by `@orquestrador` when a phase declares `review`
- The orchestrator does not need extra instructions; it reads the manifest and follows it

## Process

### Step 1 - Phase Produces Output
The phase executor produces its output normally.

### Step 2 - Check Veto Conditions
Before review, verify whether any veto condition is violated:
- If `action: block` → stop the pipeline and notify the user.
- If `action: reject` → auto-reject without review to save a round.
- If `action: warn` → continue, but mark a warning.

### Step 3 - Invoke Reviewer
The executor defined in `review.reviewer` evaluates the output based on the `criteria`.

The reviewer must produce:
```
## Review: {phase-title}

**Verdict:** accepted | rejected
**Score:** {0-10}

### Criteria evaluation
- ✓ {criteria 1}: {assessment}
- ✗ {criteria 2}: {assessment with specific feedback}
- ✓ {criteria 3}: {assessment}

### Feedback (if rejected)
{Specific, actionable feedback for the creator. Not vague — exact issues and suggestions.}

### Veto check
- {veto condition 1}: passed | triggered
```

### Step 4 - If Accepted
Mark the phase as completed. Continue to the next phase.

### Step 5 - If Rejected
1. Increment retry counter.
2. If retry counter > maxRetries, escalate:
   - `human`: pause and request a human decision
   - `skip`: skip the phase with a warning
   - `fail`: fail the pipeline
3. If retries remain:
   - `feedback` strategy: send reviewer feedback to the original executor
   - `fresh` strategy: rerun without previous attempt context
   - `alternative` strategy: ask a different executor when available
4. Return to the `onReject` phase ID.

## Rules
- Never allow more than `maxRetries` iterations.
- Always include reviewer feedback in the retry.
- The reviewer must never be the same executor that created the output.
- Log every retry: attempt number, reason, feedback.
