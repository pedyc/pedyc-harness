/**
 * The `preset.json` document shipped inside a preset package.
 *
 * A preset is a governance specification. Today it is a data package: it
 * declares what it inherits and where the documents it provides live inside its
 * own package, and no field may point outside the package directory. `entry` is
 * the declared hook for a preset that also ships code; the resolver validates
 * only the path, and no runtime loads it yet (M21).
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
  /**
   * Path to the module that registers this preset's extensions.
   *
   * Declared for forward compatibility; no runtime loads it yet (M21). The
   * resolver validates only that the path stays inside the package and exists.
   */
  entry?: string
  /**
   * Path to the checks document this preset declares.
   *
   * Read by the config layer on every run: the checks of every resolved preset
   * are unioned with the project's own document, and each one becomes a rule id
   * a policy may address. The analyzers a declaration names are code and are
   * supplied separately (built-in today, registered through `entry` at M21).
   */
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
