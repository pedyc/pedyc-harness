/**
 * The `preset.json` document shipped inside a preset package.
 *
 * A preset is data, not code. It declares what it inherits and where the
 * documents it provides live inside its own package; nothing in it is executed,
 * and no field may point outside the package directory.
 */
export interface PresetManifest {
  /**
   * The package name, e.g. `@pedyc/harness-preset-vue`.
   *
   * It must equal the package the manifest was resolved from. Two packages
   * claiming one identity would make `extends` ambiguous and make a cycle
   * report name a package the reader cannot find.
   */
  name: string
  /**
   * Package names this preset inherits from, never versions: versions belong to
   * `package.json` and the lockfile, so a project upgrades a preset the same way
   * it upgrades any other dependency.
   */
  extends?: string[]
  /** Path to a policy document inside this package. */
  policy?: string
  /** Path to an agent configuration document inside this package. */
  agents?: string
  /** Path to the markdown `init` uses to seed the target project's `AGENTS.md`. */
  instruction?: string
  /** Declared for forward compatibility; no runtime consumes it yet. */
  verification?: string
  /** Declared for forward compatibility; no runtime consumes it yet. */
  rules?: string[]
}

/**
 * A preset that has been located and whose inheritance has been resolved.
 *
 * `ResolvedPreset[]` is ordered dependencies-first, so a later entry is always
 * more specific than the ones it inherits from.
 */
export interface ResolvedPreset {
  /** The npm package name this preset came from. */
  packageName: string
  /** The name the preset manifests under. Equal to `packageName`. */
  name: string
  /** Absolute path of the package directory. */
  directory: string
  /** Direct dependencies in declaration order, deduplicated by the resolver. */
  extends: string[]
  /** The validated `preset.json` contents. */
  manifest: PresetManifest
}
