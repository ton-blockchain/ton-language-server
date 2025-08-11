/// `int` is the primitive 257-bit signed integer type.
type int = builtin

/// `bool` is a classic boolean type, which can hold only two values: `true` and `false`.
/// At the TVM (TON virtual machine) level, it's an integer -1 or 0.
/// Note: `boolVar as int` is possible, but remember, that true is -1, not 1!
type bool = builtin

/// `cell` is a data structure, which can hold of up to 1023 bits (not bytes!)
/// and up to 4 references (refs) to other cells.
/// Both contract code and contract state are represented by a tree of cells.
/// See docs: https://docs.ton.org/v3/documentation/data-formats/tlb/cell-boc
type cell = builtin

/// `slice` is a "cell opened for reading".
/// When you call [cell.beginParse], you get a `slice`, from which you can load binary data
/// or high-level structures with [T.fromSlice].
type slice = builtin

/// `builder` is a "cell at the stage of creation".
/// When you call [beginCell], you get a `builder`, populate it with binary data or structures,
/// and after [builder.endCell], you get a `cell`.
type builder = builtin

/// `continuation` are "executable cells" representing executable TVM bytecode.
/// They are used to manage execution flow in TVM programs and serve as
/// the basis for function calls, exception handling, and control flow operations.
type continuation = builtin

/// `tuple` is a collection from 0 to 255 elements of any type.
/// You can push, pop, access individual elements as `someTuple.0`.
/// A tuple occupies one stack slot regardless of its size.
type tuple = builtin

/// `address` represents an internal/external/none address.
/// Most likely, you'll use it for internal addresses — "an address of a smart contract".
/// It's `slice` under the hood. `someAddress as slice` is also possible.
/// See docs: https://docs.ton.org/learn/overviews/addresses#address-of-smart-contract
type address = builtin

/// `never` is a special type that represents computations that never complete normally.
/// A functions that always throw an exception returns `never`, and the compiler knows
/// that any code after it is unreachable.
type never = builtin

/// `int8`, `int32`, `int222`, etc. is "a fixed-width signed integer with N bits", N <= 257.
/// Note: it's still `int` at runtime, you can assign "100500" to "int8":
/// overflow will happen at serialization to a cell/builder, NOT at assignment.
type intN = builtin

/// `uint32`, `uint64`, `uint111`, etc. is "a fixed-width unsigned integer with N bits", N <= 256.
/// Note: it's still `int` at runtime, you can assign "100500" to "uint8":
/// overflow will happen at serialization to a cell/builder, NOT at assignment.
type uintN = builtin

/// `coins` is a special primitive representing "nanotoncoins". One TON = 10^9 nanotoncoins.
/// You can create coins with `ton()` function: `ton("0.05")` (actually, `int` 50000000 at runtime).
/// Arithmetic operations on `coins` degrade to 257-bit `int` type.
type coins = builtin

/// `varint16` is `int` at runtime, but serialized as "variadic signed int", -2^119 <= X < 2^119.
type varint16 = builtin

/// `varuint16` is `int` at runtime, but serialized as "variadic unsigned int", 0 <= X < 2^120.
type varuint16 = builtin

/// `varint32` is `int` at runtime, but serialized as "variadic signed int", -2^247 <= X < 2^247.
type varint32 = builtin

/// `varuint32` is `int` at runtime, but serialized as "variadic unsigned int", 0 <= X < 2^248.
type varuint32 = builtin

/// `bits256`, `bits111`, etc. is "a fixed-width slice with N bits and 0 refs", N <= 1023.
/// Note: use `as` operator to convert `slice` to `bitsN`: `someSlice as bits256`
/// (manually writing `as` enforces you to think that this conversion is correct).
/// Note: similar to `intN`, you can assign an invalid slice to `bitsN`,
/// an error will be fired at serialization with [T.toCell] and similar, NOT at assignment.
type bitsN = builtin

/// `bytes8`, `bytes99`, etc. is a convenient alias for `bits(N*8)`
type bytesN = builtin

/// `map<K, V>` is "a map from a key K to a value V".
/// Internally, it's an "optional cell": an empty map is `null`, a non-empty points to a root cell.
/// Restrictions for K and V types:
/// - a key must be fixed-with; valid: int32, uint64, address, bits256, Point; invalid: int, coins
/// - a value must be serializable; valid: int32, coins, AnyStruct, Cell<AnyStruct>; invalid: int, builder
type map<K, V> = builtin

/// `void` is the unit type representing the absence of a meaningful value.
/// It's similar to both `void` and `unit` in other languages.
/// Note: a function without return type means "auto infer", NOT "void".
type void = builtin

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
type self = builtin;

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
type null = builtin;

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
