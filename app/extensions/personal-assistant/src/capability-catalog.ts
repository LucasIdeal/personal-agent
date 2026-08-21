import type { CapabilityPlugin } from './capabilities.ts'
import { mergeCapabilities, resolveSkillRoots, scanSkillRoots, type SkillEntry } from './skill-catalog.ts'
import { setMergedCapabilities } from './capabilities.ts'

export class CapabilityCatalog {
  private skills: SkillEntry[] = []

  async refresh(notesDir: string): Promise<CapabilityPlugin[]> {
    this.skills = await scanSkillRoots(resolveSkillRoots(notesDir))
    const merged = mergeCapabilities(this.skills)
    setMergedCapabilities(merged)
    return merged
  }

  listSkills(): SkillEntry[] {
    return this.skills.slice()
  }

  list(): CapabilityPlugin[] {
    return mergeCapabilities(this.skills)
  }
}
