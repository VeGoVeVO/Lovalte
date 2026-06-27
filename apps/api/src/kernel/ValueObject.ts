/** Immutable value object compared by structural value, not identity. */
export abstract class ValueObject<T extends object> {
  protected constructor(public readonly props: Readonly<T>) {
    Object.freeze(this.props);
  }
  equals(other?: ValueObject<T> | null): boolean {
    if (!other) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
