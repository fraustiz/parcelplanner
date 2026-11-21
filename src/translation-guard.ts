/**
 * Keeps React working when the browser translates the page.
 *
 * Chrome's and Edge's translators replace the text nodes React rendered with
 * their own. When React later removes or inserts next to one of those nodes,
 * the DOM throws NotFoundError ("The node to be removed is not a child of this
 * node") in React's commit phase. Sentry showed it on pages translated to
 * Czech; `translate="no"` on the selects only covered the menus.
 *
 * Both methods keep their normal behaviour and only stop throwing when the
 * node is no longer where React left it, which is the case React cannot
 * recover from. See https://github.com/facebook/react/issues/11538.
 */
export function guardAgainstTranslation(proto: Node = Node.prototype): void {
  const marked = proto as Node & { __translationGuard?: true };
  if (marked.__translationGuard) return;
  marked.__translationGuard = true;

  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return node;
    return insertBefore.call(this, node, reference) as T;
  };
}
