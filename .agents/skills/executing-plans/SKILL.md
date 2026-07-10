---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

> **Zed adaptation:**
> - Skill references like `superpowers:finishing-a-development-branch` map to Zed skills of the same name (drop the `superpowers:` prefix).
> - "Create todos" → use Zed's task/todo list.
> - "subagents" → the `spawn_agent` tool (Zed supports it; `subagent-driven-development` is available if you want per-task subagents).
> - Git commands run via the `terminal` tool: read-only ones use `git --no-pager`, editor ones use `GIT_EDITOR=true`. Do NOT commit unless the user explicitly asks.
> - A written plan file is ideal but optional in Zed. If the "plan" is a short agreed list of fixes from this conversation, treat that list as the plan: create todos, execute each, verify.

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

### Step 1: Load and Review Plan
1. Read the plan file (or, in Zed, the agreed list of tasks from this conversation)
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. If no concerns: Create todos for the plan items and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Run the project's verification (tests / typecheck / build) and report results.
- If the user wants to wrap up the branch (merge/PR/cleanup), use the `finishing-a-development-branch` skill. Otherwise just report completion — do NOT commit or merge unless asked.

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Related workflow skills (drop the `superpowers:` prefix in Zed):**
- **using-git-worktrees** - Ensures isolated workspace (creates one or verifies existing)
- **writing-plans** - Creates the plan this skill executes
- **finishing-a-development-branch** - Complete development after all tasks
- **subagent-driven-development** - Alternative: fresh `spawn_agent` per task with review between tasks
