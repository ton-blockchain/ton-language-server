/// `int` is the primitive 257-bit signed integer type.
type int = builtin_type;

/// `bool` is the classical boolean type, which can hold only two values: `true` and `false`.
/// It is convenient for boolean and logical operations, as well as for storing flags.
///
/// There are no implicit type conversions in Tolk, so addition `+` of two boolean values is
/// not possible. However, many comparison operators are available.
///
/// Persisting bools to state is very space-efficient, as they only occupy 1 bit.
/// Storing 1000 bools in state [costs](https://ton.org/docs/develop/smart-contracts/fees#how-to-calculate-fees)
/// about 0.00072 TON per year.
type bool = builtin_type;

/// `cell` is a primitive and a data structure, which ordinarily consists of up to 1023 continuously
/// laid out bits and up to 4 references (refs) to other cells. Circular references are forbidden and
/// cannot be created by means of [TVM], which means cells can be viewed as [quadtrees]
/// or [directed acyclic graphs (DAGs)][dag] of themselves.
///
/// Contract code itself is represented by a tree of cells.
///
/// Cells and cell primitives are bit-oriented, not byte-oriented: [TVM] regards data kept in cells
/// as sequences (strings or streams) of up to 1023 bits, not bytes. If necessary, contracts are
/// free to use, for example, 21-bit integer fields serialized into [TVM] cells, thus using fewer
/// persistent storage bytes to represent the same data.
///
/// [TVM]: https://docs.ton.org/learn/tvm-instructions/tvm-overview
/// [quadtrees]: https://en.wikipedia.org/wiki/Quadtree
/// [dag]: https://en.wikipedia.org/wiki/Directed_acyclic_graph
type cell = builtin_type;

/// `slice` is a cell manipulation primitive used for cell parsing instructions.
/// Unlike cells, slices are mutable and allow extraction or loading of data previously
/// stored in cells via serialization instructions. Also unlike cells, values of type `slice`
/// appear only on the [TVM] stack and cannot be stored in persistent storage.
/// This means, for example, that persistent storage fields with type `slice` would actually
/// be stored as cells under the hood.
///
/// The `slice` type represents either the remainder of a partially parsed cell or a value (subcell)
/// residing inside such a cell, extracted from it by a parsing instruction.
///
/// [TVM]: https://docs.ton.org/learn/tvm-instructions/tvm-overview
type slice = builtin_type;

/// `builder` is a cell manipulation primitive used for cell creation instructions.
/// They are immutable just like cells and allow constructing new cells from previously
/// stored values and cells.
///
/// Unlike cells, values of type `builder` appear only on the [TVM] stack and cannot
/// be stored in persistent storage. This means, for example, that persistent storage
/// fields with type `builder` are actually stored as cells under the hood.
///
/// The `builder` type represents partially composed cells, for which fast operations
/// to append integers, other cells, references to other cells, and many other operations
/// are defined.
///
/// [TVM]: https://docs.ton.org/learn/tvm-instructions/tvm-overview
type builder = builtin_type;

/// `continuation` is a primitive type that represents executable [TVM] code.
/// Continuations are used to manage execution flow in [TVM] programs and serve as
/// the basis for function calls, exception handling, and control flow operations.
///
/// In practical terms, continuations can be viewed as "executable cells" - they contain
/// bytecode that can be executed by the virtual machine. Smart contract code itself
/// is stored as a continuation.
///
/// [TVM]: https://docs.ton.org/learn/tvm-instructions/tvm-overview
type continuation = builtin_type;

/// `tuple` is an ordered collection type that can hold up to 255 elements of any type.
/// Unlike tensors which are represented as multiple stack entries, tuples are stored
/// as a single composite value on the [TVM] stack.
///
/// Tuples provide dynamic data structures where the number and types of elements
/// can vary at runtime. They are particularly useful for handling variable-length
/// data and implementing complex data structures like lisp-like lists.
///
/// Individual elements can be accessed using indexing operations (e.g. `someTuple.0`),
/// and tuples can be modified by adding, removing, or replacing elements. Empty tuples are also valid.
///
/// Tuples occupy only one stack slot regardless of their size.
///
/// [TVM]: https://docs.ton.org/learn/tvm-instructions/tvm-overview
type tuple = builtin_type;

/// `coins` is a specialized primitive type for representing amounts of Toncoins
/// in the smallest possible unit (nanotons). One Toncoin equals 10^9 nanotons.
///
/// The `coins` type is essentially a 16-bit variable-length integer with special semantic
/// meaning and dedicated operations for monetary calculations. It ensures precision
/// in financial operations.
///
/// You can create `coins` values using the `ton()` function with human-readable
/// string literals: `ton("1.5")` creates 1.5 TON worth of nanotons.
///
/// Arithmetic operations on `coins` degrade to 257-bit `int` type, allowing mathematical
/// operations while maintaining type safety for monetary values.
///
/// Example:
/// ```
/// var amount: coins = ton("1.5");
/// var total: coins = amount + ton("0.5");
/// ```
///
/// [fees]: https://docs.ton.org/develop/smart-contracts/fees
type coins = builtin_type;

/// `address` is a primitive type that represents a [smart contract address] in TON Blockchain.
///
/// [smart contract address]: https://docs.ton.org/learn/overviews/addresses#address-of-smart-contract
type address = builtin_type;

/// `never` is a special type that represents computations that never complete normally.
/// Functions that always throw exceptions return `never`.
///
/// When a function returns `never`, the compiler knows that code after calling
/// such a function is unreachable, eliminating the need for explicit return statements.
///
/// Example:
/// ```
/// fun alwaysThrows(): never { throw 123 }
///
/// fun main(val: int) {
///   if (val == 100) {
///     alwaysThrows();
///     debug.printString("This line is unreachable");
///   }
/// }
/// ```
type never = builtin_type;

/// `void` is the unit type representing the absence of a meaningful value.
/// It is used to indicate that a function does not return any useful data
/// or that a computation produces no result.
///
/// Functions with return type `void` are executed for their side effects
/// (like modifying global state, sending messages, or dumping output)
/// rather than for producing a return value.
///
/// Example:
/// ```
/// fun processMessage(): void { ... }
/// ```
///
/// Note: function without return type is NOT equivalent to `void`, but rather `auto`.
type void = builtin_type;

/// `null` is a primitive type that represents the absence of a value.
/// It is the type of the `null` literal and serves as the "nothing" value
/// in nullable type expressions (e.g. `int?`).
///
/// In Tolk's type system, `null` is used to construct nullable types:
/// `int?` is equivalent to `int | null`, meaning a value that can be
/// either an integer or null.
///
/// The `null` type ensures null safety through compile-time checks,
/// preventing null pointer errors that are common in other languages.
/// You must explicitly check for null before using potentially null values.
///
/// Example:
/// ```
/// var maybeValue: int? = null;
/// ```
type null = builtin_type;

/// `self` is a special return type marker used in method definitions to indicate
/// that the method returns the same object it was called on, enabling method chaining.
///
/// When a method declares `self` as its return type, it means the method reads (and maybe modifies)
/// the object and returns it, allowing for fluent interface patterns commonly
/// used with builders and similar types.
///
/// Note: `self` is not a true type but rather a compile-time marker that gets
/// resolved to the actual type of the receiver object during type checking.
///
/// Example:
/// ```
/// fun builder.storeInt(mutate self, v: int, len: int): self { ... }
/// ```
/// This allows chaining:
/// ```
/// someBuilder.storeInt(42, 32).storeInt(24, 32)
/// ```
type self = builtin_type;

/// Represents a fixed-width unsigned integer of `N` bits, where `N` can range from 1 to 256.
///
/// Example:
/// ```
/// struct (0x7e8764ef) IncrementMessage {
///   queryID: uint64; // precise 64-bit unsigned integer serialization/deserialization
///   increaseBy: uint32; // precise 32-bit unsigned integer serialization/deserialization
/// }
/// ```
type uintN = builtin_type;

/// Represents a fixed-width signed integer of `N` bits, where `N` can range from 1 to 257.
///
/// Example:
/// ```
/// struct (0x7e8764ef) IncrementMessage {
///   queryID: uint64; // precise 64-bit unsigned integer serialization/deserialization
///   increaseBy: int32; // precise 32-bit signed integer serialization/deserialization
/// }
/// ```
type intN = builtin_type;

/// Represents an unsigned variable size-width signed integer of 32 bits.
type varuint32 = builtin_type;

/// Represents a signed variable size-width signed integer of 32 bits.
type varint32 = builtin_type;

/// Represents an unsigned variable size-width signed integer of 16 bits.
type varuint16 = builtin_type;

/// Represents a signed variable size-width signed integer of 16 bits.
type varint16 = builtin_type;

/// Represents a fixed-length sequence of `N` bits, where `N` can range from 1 to 1023.
///
/// At the TVM level, `bitsN` is backed by a `slice`. This type is used for handling
/// raw binary data of a known, fixed size.
///
/// Example:
/// ```
/// struct (0x7e8764ef) MessageWithSignature {
///   message: bits256; // precise 256-bit binary data serialization/deserialization
///   signature: bits256; // precise 256-bit binary data serialization/deserialization
/// }
/// ```
type bitsN = builtin_type;

/// Represents a fixed-length sequence of `N` bytes. This is a convenient alias for `bits(N * 8)`.
/// `N` can range from 1 to 127.
///
/// Example:
/// ```
/// struct (0x7e8764ef) MessageWithSignature {
///   message: bytes32; // precise 32-byte binary data serialization/deserialization
///   signature: bytes32; // precise 32-byte binary data serialization/deserialization
/// }
/// ```
type bytesN = builtin_type;

type builtin_type = void;

// builtin operators
// they are internally stored as functions, because at IR level, there is no difference
// between calling `userAdd(a,b)` and `_+_(a,b)`
// since they are registered in a global symtable, technically, they can even be referenced from Tolk code,
// though it's a "hidden feature" and won't work well for overloads (`==` for int and bool, for example)

// unary operators

@pure
fun `-_`(x: int): int builtin;

@pure
fun `+_`(x: int): int builtin;

@pure
fun `!_`(x: int): int builtin;

@pure
fun `!b_`(x: bool): bool builtin;

@pure
fun `~_`(x: int): int builtin;

// binary operators

@pure
fun `_+_`(x: int, y: int): int builtin;

@pure
fun `_-_`(x: int, y: int): int builtin;

@pure
fun `_*_`(x: int, y: int): int builtin;

@pure
fun `_/_`(x: int, y: int): int builtin;

@pure
fun `_~/_`(x: int, y: int): int builtin;

@pure
fun `_^/_`(x: int, y: int): int builtin;

@pure
fun `_%_`(x: int, y: int): int builtin;

@pure
fun `_<<_`(x: int, y: int): int builtin;

@pure
fun `_>>_`(x: int, y: int): int builtin;

@pure
fun `_~>>_`(x: int, y: int): int builtin;

@pure
fun `_^>>_`(x: int, y: int): int builtin;

@pure
fun `_&_`(x: int, y: int): int builtin;

@pure
fun `_&_`(x: bool, y: bool): bool builtin;

@pure
fun `_|_`(x: int, y: int): int builtin;

@pure
fun `_|_`(x: bool, y: bool): bool builtin;

@pure
fun `_^_`(x: int, y: int): int builtin;

@pure
fun `_^_`(x: bool, y: bool): bool builtin;

@pure
fun `_==_`(x: int, y: int): bool builtin;

@pure
fun `_==_`(x: bool, y: bool): bool builtin;

@pure
fun `_!=_`(x: int, y: int): bool builtin;

@pure
fun `_!=_`(x: bool, y: bool): bool builtin;

@pure
fun `_<_`(x: int, y: int): bool builtin;

@pure
fun `_>_`(x: int, y: int): bool builtin;

@pure
fun `_<=_`(x: int, y: int): bool builtin;

@pure
fun `_>=_`(x: int, y: int): bool builtin;

@pure
fun `_<=>_`(x: int, y: int): int builtin;

@pure
fun T.estimatePackSize(self): [int, int, int, int]
    builtin;

// functions not presented in stdlib at all
// used in tolk-tester to check/expose internal compiler state
// each of them is handled in a special way, search by its name
@pure
fun __expect_type<T>(actual: T, expect: slice)
    builtin;

@pure
fun T.__toTuple(self): tuple
    builtin;

@pure
fun __expect_lazy<T>(value: T)
    builtin;

@pure
fun __expect_inline<T>(value: T)
    builtin;
