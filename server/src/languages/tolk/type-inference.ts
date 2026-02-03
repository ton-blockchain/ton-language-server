//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {Node as SyntaxNode} from "web-tree-sitter"

import {
    BitsNTy,
    BoolTy,
    BuiltinTy,
    BytesNTy,
    CoinsTy,
    EnumTy,
    FuncTy,
    InstantiationTy,
    IntNTy,
    IntTy,
    joinTypes,
    NeverTy,
    NullTy,
    StringTy,
    StructTy,
    subtractTypes,
    TensorTy,
    TupleTy,
    Ty,
    TypeAliasTy,
    TypeParameterTy,
    UnionTy,
    UnknownTy,
    VarIntNTy,
    VoidTy,
} from "@server/languages/tolk/types/ty"
import {
    Constant,
    Enum,
    EnumMember,
    Field,
    FunctionBase,
    GetMethod,
    GlobalVariable,
    InstanceMethod,
    MethodBase,
    StaticMethod,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {CallLike, Lambda, NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Reference, ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {index, IndexFinder, IndexKey} from "@server/languages/tolk/indexes"
import {ResolveState} from "@server/psi/ResolveState"
import {parentOfType} from "@server/psi/utils"
import {TOLK_CACHE} from "@server/languages/tolk/cache"
import {filePathToUri} from "@server/files"
import {trimBackticks} from "@server/languages/tolk/lang/names-util"

export class GenericSubstitutions {
    public constructor(public mapping: Map<string, Ty> = new Map()) {}

    public deduce(paramTy: Ty | null, argTy: Ty): GenericSubstitutions {
        if (!paramTy) {
            return new GenericSubstitutions(new Map())
        }

        const mapping: Map<string, Ty> = new Map(this.mapping)
        GenericSubstitutions.deduceTo(mapping, paramTy, argTy)
        return new GenericSubstitutions(mapping)
    }

    public static deduce(paramTy: Ty | null, argTy: Ty): GenericSubstitutions {
        if (!paramTy) {
            return new GenericSubstitutions(new Map())
        }

        const mapping: Map<string, Ty> = new Map()
        this.deduceTo(mapping, paramTy, argTy)
        return new GenericSubstitutions(mapping)
    }

    public static deduceTo(mapping: Map<string, Ty>, paramTy: Ty, argTy: Ty): void {
        if (paramTy instanceof InstantiationTy) {
            const unwrappedArgType = argTy.unwrapAlias()
            if (unwrappedArgType instanceof InstantiationTy) {
                for (
                    let i = 0;
                    i < Math.min(paramTy.types.length, unwrappedArgType.types.length);
                    i++
                ) {
                    this.deduceTo(mapping, paramTy.types[i], unwrappedArgType.types[i])
                }
            }

            if (argTy instanceof InstantiationTy) {
                for (let i = 0; i < Math.min(paramTy.types.length, argTy.types.length); i++) {
                    this.deduceTo(mapping, paramTy.types[i], argTy.types[i])
                }
                return
            }
        }

        if (paramTy instanceof FuncTy && argTy instanceof FuncTy) {
            for (let i = 0; i < Math.min(paramTy.params.length, argTy.params.length); i++) {
                this.deduceTo(mapping, paramTy.params[i], argTy.params[i])
            }

            this.deduceTo(mapping, paramTy.returnTy, argTy.returnTy)
            return
        }

        if (
            paramTy instanceof TensorTy &&
            argTy instanceof TensorTy &&
            paramTy.elements.length === argTy.elements.length
        ) {
            for (let i = 0; i < paramTy.elements.length; i++) {
                this.deduceTo(mapping, paramTy.elements[i], argTy.elements[i])
            }
            return
        }

        if (
            paramTy instanceof TupleTy &&
            argTy instanceof TupleTy &&
            paramTy.elements.length === argTy.elements.length
        ) {
            for (let i = 0; i < paramTy.elements.length; i++) {
                this.deduceTo(mapping, paramTy.elements[i], argTy.elements[i])
            }
            return
        }

        if (paramTy instanceof UnionTy) {
            if (!(argTy instanceof UnionTy)) {
                // `arg: int | MyData<T>` called as `f(MyData<int>)` => T is int
                for (const element of paramTy.elements) {
                    this.deduceTo(mapping, element, argTy)
                }
                return
            }

            // `arg: T1 | T2` called as `f(intOrBuilder)` => T1 is int, T2 is builder
            // `arg: int | T1` called as `f(builderOrIntOrSlice)` => T1 is builder|slice
            let aSubP = argTy.elements
            const paramGenerics: Ty[] = []
            let isSubCorrect = true

            for (const paramVariant of paramTy.elements) {
                if (paramVariant.hasGenerics()) {
                    paramGenerics.push(paramVariant)
                } else {
                    if (aSubP.some(it => it.equals(paramVariant))) {
                        aSubP = aSubP.filter(x => !x.equals(paramVariant))
                    } else {
                        isSubCorrect = false
                    }
                }
            }

            if (isSubCorrect && paramGenerics.length === 1 && aSubP.length > 1) {
                this.deduceTo(mapping, paramGenerics[0], UnionTy.create(aSubP))
                return
            }

            if (isSubCorrect && paramGenerics.length === aSubP.length) {
                for (const [i, paramGeneric] of paramGenerics.entries()) {
                    this.deduceTo(mapping, paramGeneric, aSubP[i])
                }
                return
            }

            return
        }

        if (paramTy instanceof TypeParameterTy) {
            const prev = mapping.get(paramTy.name())
            if (prev && !(prev instanceof TypeParameterTy) && !(prev instanceof NeverTy)) {
                return
            }

            if (argTy.name() === paramTy.name()) {
                // like TBody to TBody
                // use a default type if present
                const defaultTypeNode = paramTy.anchor?.defaultType()
                if (defaultTypeNode && paramTy.anchor) {
                    const defaultType = InferenceWalker.convertType(
                        defaultTypeNode,
                        paramTy.anchor.file,
                    )
                    if (defaultType) {
                        mapping.set(paramTy.name(), defaultType)
                        return
                    }
                }
            }

            mapping.set(paramTy.name(), argTy)
        }
    }
}

enum UnreachableKind {
    Unknown = 0,
    CantHappen = 1,
    ThrowStatement = 2,
    ReturnStatement = 3,
    CallNeverReturnFunction = 4,
    InfiniteLoop = 5,
}

class ExprFlow {
    public constructor(
        public readonly outFlow: FlowContext,
        public readonly trueFlow: FlowContext,
        public readonly falseFlow: FlowContext,
    ) {}

    public static create(outFlow: FlowContext, cloneFlowForCondition: boolean): ExprFlow {
        const trueFlow = cloneFlowForCondition ? FlowContext.from(outFlow) : outFlow
        const falseFlow = cloneFlowForCondition ? FlowContext.from(outFlow) : outFlow
        return new ExprFlow(outFlow, trueFlow, falseFlow)
    }
}

class FlowContext {
    public constructor(
        public symbols: Map<string, NamedNode> = new Map(),
        public symbolTypes: Map<number, Ty> = new Map(),
        public sinkExpressions: Map<bigint, [Ty, SinkExpression]> = new Map(),
        public unreachable: UnreachableKind | null = null,
    ) {}

    public static from(other: FlowContext): FlowContext {
        return new FlowContext(
            new Map(other.symbols.entries()),
            new Map(other.symbolTypes.entries()),
            new Map(other.sinkExpressions.entries()),
            other.unreachable,
        )
    }

    public clone(): FlowContext {
        return FlowContext.from(this)
    }

    public getType(node: SyntaxNode): Ty | null {
        return this.symbolTypes.get(node.id) ?? null
    }

    public getSinkType(sink: SinkExpression): Ty | null {
        return this.sinkExpressions.get(sink.hash())?.[0] ?? null
    }

    public setSymbol(element: NamedNode, ty: Ty): void {
        const name = element.name(false)
        this.symbols.set(name, element)
        this.symbolTypes.set(element.node.id, ty)
        this.invalidateAllSubfields(element, 0, 0)
    }

    public setSink(element: SinkExpression, ty: Ty): void {
        let indexPath = element.indexPath
        let indexMask = 0

        while (indexPath > 0) {
            indexMask = indexPath >> 8 || 0xff
            indexPath = indexPath >> 8
        }

        this.invalidateAllSubfields(element.symbol, element.indexPath, indexMask)
        this.sinkExpressions.set(element.hash(), [ty, element])
    }

    private invalidateAllSubfields(
        element: NamedNode,
        parentPath: number,
        parentMask: number,
    ): void {
        const newSinks: Map<bigint, [Ty, SinkExpression]> = new Map()

        for (const [key, [ty, sink]] of this.sinkExpressions) {
            if (sink.symbol.node.id === element.node.id) {
                if ((sink.indexPath & parentMask) === parentPath) {
                    // remove this expression
                    continue
                }
            }

            newSinks.set(key, [ty, sink])
        }

        this.sinkExpressions = newSinks
    }

    public join(other: FlowContext): FlowContext {
        if (this.unreachable === null && other.unreachable !== null) {
            return other.join(this)
        }

        const joinedSymbols: Map<string, NamedNode> = new Map(this.symbols)
        let joinedSinkExpressions: Map<bigint, [Ty, SinkExpression]>
        let joinedSymbolTypes: Map<number, Ty>

        if (this.unreachable !== null && other.unreachable === null) {
            joinedSymbolTypes = new Map(this.symbolTypes)
            for (const [key, value] of other.symbolTypes) {
                joinedSymbolTypes.set(key, value)
            }
            joinedSinkExpressions = new Map()
            for (const [key, value] of other.sinkExpressions) {
                joinedSinkExpressions.set(key, value)
            }
        } else {
            joinedSymbolTypes = new Map(this.symbolTypes)
            for (const [otherKey, value] of other.symbolTypes) {
                const before = joinedSymbolTypes.get(otherKey)
                const after = value
                const result = before ? joinTypes(before, after) : after
                joinedSymbolTypes.set(otherKey, result)
            }
            joinedSinkExpressions = new Map()
            for (const [otherKey, [tyAfter]] of other.sinkExpressions) {
                const before = this.sinkExpressions.get(otherKey)
                if (before) {
                    const [tyBefore, sinkBefore] = before
                    const result = joinTypes(tyBefore, tyAfter)
                    joinedSinkExpressions.set(otherKey, [result, sinkBefore])
                }
            }
        }

        const joinedUnreachable =
            this.unreachable !== null && other.unreachable !== null ? UnreachableKind.Unknown : null

        return new FlowContext(
            joinedSymbols,
            joinedSymbolTypes,
            joinedSinkExpressions,
            joinedUnreachable,
        )
    }
}

class InferenceContext {
    public file: TolkFile
    public selfType: Ty | null = null
    public declaredReturnType: Ty | undefined = undefined
    public expressionTypes: Map<number, Ty> = new Map()
    public resolvedRefs: Map<number, NamedNode> = new Map()
    public varTypes: Map<number, Ty> = new Map()
    public returnStatements: SyntaxNode[] = []
    public returnTypes: Ty[] = []

    public constructor(file: TolkFile) {
        this.file = file
    }

    public setResolved(node: SyntaxNode, target: NamedNode | null): void {
        if (!target) return
        this.resolvedRefs.set(node.id, target)
    }

    public getResolved(node: SyntaxNode): NamedNode | null {
        return this.resolvedRefs.get(node.id) ?? null
    }

    public setType(node: SyntaxNode | null | undefined, ty: Ty | null): void {
        if (!node || !ty) return
        this.expressionTypes.set(node.id, ty)
    }

    public setVarType(node: SyntaxNode | null, ty: Ty | null): void {
        if (!node || !ty) return
        this.varTypes.set(node.id, ty)
    }

    public getType(node: SyntaxNode): Ty | null {
        return this.expressionTypes.get(node.id) ?? this.varTypes.get(node.id) ?? null
    }

    public getVarType(node: SyntaxNode): Ty | null {
        return this.varTypes.get(node.id) ?? null
    }
}

class InferenceWalker {
    public constructor(public ctx: InferenceContext) {}

    public static methodCandidates(
        ctx: InferenceContext,
        qualifierTy: Ty,
        searchName: string,
    ): MethodBase[] {
        const walker = new InferenceWalker(ctx)
        return walker.methodCandidates(qualifierTy, searchName)
    }

    public inferConstant(constant: Constant, flow: FlowContext): FlowContext {
        const expression = constant.value()?.node
        if (!expression) return flow

        const typeHint = constant.typeNode()?.node
        const typeHintTy = InferenceWalker.convertType(typeHint, constant.file)
        const flowAfterExpression = this.inferExpression(expression, flow, false, typeHintTy)
        const exprType = this.ctx.getType(expression)
        this.ctx.setType(constant.node, exprType)
        return flowAfterExpression.outFlow
    }

    public inferGlobalVariable(variable: GlobalVariable, flow: FlowContext): FlowContext {
        const typeHint = variable.typeNode()?.node
        const typeHintTy = InferenceWalker.convertType(typeHint, variable.file)
        this.ctx.setType(variable.node, typeHintTy)
        return flow
    }

    public inferField(field: Field, flow: FlowContext): FlowContext {
        const typeHint = field.typeNode()?.node
        const typeHintTy = InferenceWalker.convertType(typeHint, field.file)

        const defaultValue = field.defaultValue()?.node
        if (defaultValue) {
            const flowAfterExpression = this.inferExpression(defaultValue, flow, false, typeHintTy)
            // foo: int? = null
            // infers as null, TODO
            // const exprType = this.ctx.getType(defaultValue)
            // this.ctx.setType(field.node, exprType)

            this.ctx.setType(field.nameNode()?.node, typeHintTy)
            this.ctx.setType(field.node, typeHintTy)
            this.ctx.setResolved(field.node, field)
            return flowAfterExpression.outFlow
        }

        this.ctx.setType(field.nameNode()?.node, typeHintTy)
        this.ctx.setType(field.node, typeHintTy)
        this.ctx.setResolved(field.node, field)

        return flow
    }

    public inferEnumMember(member: EnumMember, flow: FlowContext): FlowContext {
        const defaultValue = member.defaultValue()?.node
        if (defaultValue) {
            const flowAfterExpression = this.inferExpression(defaultValue, flow, false)
            const exprType = this.ctx.getType(defaultValue)
            this.ctx.setType(member.node, exprType)
            return flowAfterExpression.outFlow
        }

        const owner = member.owner()

        if (owner) {
            const type = owner.declaredType()
            this.ctx.setType(member.nameNode()?.node, type)
            this.ctx.setType(member.node, type)
        }

        this.ctx.setResolved(member.node, member)
        return flow
    }

    public inferTypeAlias(alias: TypeAlias, flow: FlowContext): FlowContext {
        const underlyingType = alias.underlyingType()
        if (!underlyingType) return flow

        const exprType = InferenceWalker.convertType(underlyingType, alias.file)
        this.ctx.setType(alias.node, exprType)
        this.ctx.setType(underlyingType, exprType)
        return flow
    }

    public inferFunction(func: FunctionBase, flow: FlowContext): FlowContext {
        if (func instanceof MethodBase) {
            const receiverTypeNode = func.receiverTypeNode()
            if (receiverTypeNode) {
                const selfParameterType = InferenceWalker.convertType(receiverTypeNode, func.file)
                if (selfParameterType) {
                    this.ctx.selfType = selfParameterType
                    this.ctx.setType(receiverTypeNode, selfParameterType)
                }
            }
        }

        const declaredReturnType = func.returnType()
        this.ctx.declaredReturnType =
            InferenceWalker.convertType(declaredReturnType?.node, declaredReturnType?.file) ??
            undefined

        for (const typeParameter of func.typeParameters()) {
            const defaultTypeNode = typeParameter.defaultType()
            if (defaultTypeNode) {
                const defaultType = InferenceWalker.convertType(defaultTypeNode, func.file)
                flow.setSymbol(typeParameter, new TypeParameterTy(typeParameter, defaultType))
            } else {
                flow.setSymbol(typeParameter, new TypeParameterTy(typeParameter))
            }
        }

        for (const [index, param] of func.parameters().entries()) {
            const declaredParamType = InferenceWalker.convertType(param.typeNode()?.node, func.file)

            const paramType =
                (index === 0 && param.name() === "self" ? this.ctx.selfType : declaredParamType) ??
                UnknownTy.UNKNOWN

            const defaultValue = param.defaultValue()
            if (defaultValue) {
                flow = this.inferExpression(defaultValue.node, flow, false, paramType).outFlow
            }

            flow.setSymbol(param, paramType)
            this.ctx.setType(param.node, paramType)
            this.ctx.setVarType(param.node, paramType)
        }

        const body = func.body
        if (body) {
            flow = this.processBlockStatement(body, flow)
        }

        // Infer a whole function type including the auto return type for future use,
        // for example, in type-hints.ts

        const parameters = func.parameters(true)
        const returnType = this.ctx.declaredReturnType ?? this.inferReturnType(flow)

        const parametersTypes = parameters.map(it => this.ctx.getType(it.node) ?? UnknownTy.UNKNOWN)

        if (func instanceof MethodBase && func.isInstanceMethod() && this.ctx.selfType) {
            // `fun int.foo(self, other: int): int`
            // has type:
            // `(int, int) -> int`
            parametersTypes.unshift(this.ctx.selfType)
        }

        const type = new FuncTy(parametersTypes, returnType)
        this.ctx.setType(func.node, type)

        if (declaredReturnType) {
            this.ctx.setType(declaredReturnType.node, returnType)
        }

        return flow
    }

    public inferReturnType(nextFlow: FlowContext): Ty {
        const returnTypes = this.ctx.returnTypes
        if (returnTypes.length === 0) {
            if (nextFlow.unreachable) {
                return NeverTy.NEVER
            }
            return VoidTy.VOID
        }
        if (returnTypes.length === 1) return returnTypes[0]

        let joined: Ty | null = null

        for (const ty of returnTypes) {
            joined = joined ? joinTypes(joined, ty) : ty
        }

        return joined ?? VoidTy.VOID
    }

    public processBlockStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const statements = node.namedChildren
        if (statements.length === 0) return flow

        let nextFlow = flow
        for (const statement of statements) {
            if (!statement) continue
            nextFlow = this.inferStatement(statement, nextFlow)
        }
        return nextFlow
    }

    public inferStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        switch (node.type) {
            case "expression_statement": {
                return this.processExpressionStatement(node, flow)
            }
            case "block_statement": {
                return this.processBlockStatement(node, flow)
            }
            case "local_vars_declaration": {
                return this.inferLocalVariablesDeclaration(node, flow).outFlow
            }
            case "if_statement": {
                return this.processIfStatement(node, flow)
            }
            case "while_statement": {
                return this.processWhileStatement(node, flow)
            }
            case "do_while_statement": {
                return this.processDoStatement(node, flow)
            }
            case "repeat_statement": {
                return this.processRepeatStatement(node, flow)
            }
            case "try_catch_statement": {
                return this.processTryStatement(node, flow)
            }
            case "return_statement": {
                return this.processReturnStatement(node, flow)
            }
            case "throw_statement": {
                return this.processThrowStatement(node, flow)
            }
            case "assert_statement": {
                return this.processAssertStatement(node, flow)
            }
            case "break_statement":
            case "continue_statement": {
                flow.unreachable = UnreachableKind.Unknown
                return flow
            }
            case "match_statement": {
                const expr = node.firstChild
                if (!expr) return flow
                return this.inferMatchExpression(expr, flow, false).outFlow
            }
        }

        return flow
    }

    private processWhileStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const condition = node.childForFieldName("condition")
        const body = node.childForFieldName("body")

        if (!condition) return flow

        const loopEntryFlow = FlowContext.from(flow)
        const afterCond = this.inferExpression(condition, loopEntryFlow, true)

        if (!body) return afterCond.falseFlow

        const bodyFlow = this.inferStatement(body, afterCond.trueFlow)

        const nextFlow = loopEntryFlow.join(bodyFlow)
        const afterCond2 = this.inferExpression(condition, nextFlow, true)
        this.inferStatement(body, afterCond2.trueFlow)

        return afterCond2.falseFlow
    }

    private processDoStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const body = node.childForFieldName("body")
        const condition = node.childForFieldName("condition")

        if (!body) return flow

        const loopEntryFlow = FlowContext.from(flow)
        let nextFlow = this.inferStatement(body, flow)

        if (!condition) return nextFlow

        const afterCond = this.inferExpression(condition, nextFlow, true)

        nextFlow = loopEntryFlow.join(afterCond.trueFlow)
        nextFlow = this.inferStatement(body, nextFlow)
        const afterCond2 = this.inferExpression(condition, nextFlow, true)

        return afterCond2.falseFlow
    }

    private processRepeatStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const count = node.childForFieldName("count")
        const body = node.childForFieldName("body")

        if (!count || !body) return flow

        const afterCount = this.inferExpression(count, flow, false)

        return this.inferStatement(body, afterCount.outFlow)
    }

    private processTryStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const tryBody = node.childForFieldName("try_body")
        if (!tryBody) return flow

        const tryFlow = this.inferStatement(tryBody, flow)

        const catchClause = node.childForFieldName("catch")
        if (!catchClause) return tryFlow

        const catchBody = catchClause.childForFieldName("catch_body")
        if (!catchBody) return tryFlow

        const catchFlow = FlowContext.from(flow)

        const catchVar1 = catchClause.childForFieldName("catch_var1")
        const catchVar2 = catchClause.childForFieldName("catch_var2")

        if (catchVar1) {
            const type = IntTy.INT
            this.ctx.setType(catchVar1, type)
            catchFlow.setSymbol(new NamedNode(catchVar1, this.ctx.file), type)
        }
        if (catchVar2) {
            const type = UnknownTy.UNKNOWN
            this.ctx.setType(catchVar2, type)
            catchFlow.setSymbol(new NamedNode(catchVar2, this.ctx.file), type)
        }

        const catchEndFlow = this.inferStatement(catchBody, catchFlow)
        return tryFlow.join(catchEndFlow)
    }

    private processAssertStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const condition = node.childForFieldName("condition")
        if (!condition) return flow

        const flowAfterCondition = this.inferExpression(condition, flow, true)

        const excNo = node.childForFieldName("excNo")
        if (excNo) {
            this.inferExpression(excNo, flowAfterCondition.falseFlow, false)
        }
        return flowAfterCondition.trueFlow
    }

    private processThrowStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const condition = node.child(1)
        if (condition) {
            flow = this.inferExpression(condition, flow, true).outFlow
        }
        flow.unreachable = UnreachableKind.ThrowStatement
        return flow
    }

    private processReturnStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const expression = node.childForFieldName("body")
        if (expression) {
            flow = this.inferExpression(
                expression,
                flow,
                false,
                this.ctx.declaredReturnType,
            ).outFlow

            const type = this.ctx.getType(expression)
            if (type) {
                this.ctx.returnTypes.push(type)
            }
        }
        flow.unreachable = UnreachableKind.ReturnStatement
        this.ctx.returnStatements.push(node)
        return flow
    }

    public processIfStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const condition = node.childForFieldName("condition")
        if (!condition) return flow

        const flowAfterCondition = this.inferExpression(condition, flow, true)
        const trueBranch = node.childForFieldName("body")

        const trueFlow = trueBranch
            ? this.processBlockStatement(trueBranch, flowAfterCondition.trueFlow)
            : flowAfterCondition.trueFlow

        const elseBranch = node.childForFieldName("alternative")
        const falseFlow = elseBranch
            ? this.inferStatement(elseBranch, flowAfterCondition.falseFlow)
            : flowAfterCondition.falseFlow

        return trueFlow.join(falseFlow)
    }

    public processExpressionStatement(node: SyntaxNode, flow: FlowContext): FlowContext {
        const expression = node.firstChild
        if (!expression) return flow
        const nextFLow = this.inferExpression(expression, flow, false)
        return nextFLow.outFlow
    }

    public inferExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null = null,
    ): ExprFlow {
        switch (node.type) {
            case "number_literal":
            case "string_literal":
            case "boolean_literal":
            case "null_literal": {
                return this.inferLiteralExpression(node, flow, usedAsCondition)
            }
            case "ternary_operator": {
                return this.inferTernaryExpression(node, flow, usedAsCondition, hint)
            }
            case "identifier":
            case "type_identifier": {
                return this.inferReferenceExpression(node, flow, usedAsCondition)
            }
            case "dot_access": {
                return this.inferDotExpression(node, flow, usedAsCondition)
            }
            case "binary_operator": {
                return this.inferBinaryExpression(node, flow, usedAsCondition)
            }
            case "is_type_operator": {
                return this.inferIsExpression(node, flow, usedAsCondition)
            }
            case "object_literal": {
                return this.inferObjectLiteralExpression(flow, node, hint)
            }
            case "match_expression": {
                return this.inferMatchExpression(node, flow, usedAsCondition)
            }
            case "function_call": {
                return this.inferCallExpression(flow, node, usedAsCondition, hint)
            }
            case "parenthesized_expression": {
                return this.inferParenExpression(node, flow, usedAsCondition, hint)
            }
            case "tensor_expression": {
                return this.inferTensorExpression(node, flow, usedAsCondition, hint)
            }
            case "typed_tuple": {
                return this.inferTupleExpression(node, flow, usedAsCondition, hint)
            }
            case "cast_as_operator": {
                return this.inferAsExpression(node, flow, usedAsCondition)
            }
            case "not_null_operator": {
                return this.inferNotNullExpression(node, flow, usedAsCondition)
            }
            case "unary_operator": {
                return this.inferUnaryExpression(node, flow, usedAsCondition)
            }
            case "assignment": {
                return this.inferAssignment(node, flow, usedAsCondition)
            }
            case "set_assignment": {
                return this.inferSetAssignment(node, flow, usedAsCondition)
            }
            case "generic_instantiation": {
                return this.inferGenericInstantiation(node, flow, usedAsCondition, hint)
            }
            case "lazy_expression": {
                return this.inferLazyExpression(node, flow, usedAsCondition, hint)
            }
            case "lambda_expression": {
                return this.inferLambdaExpression(node, flow, hint)
            }
            case "underscore": {
                this.ctx.setType(node, UnknownTy.UNKNOWN)
                return ExprFlow.create(flow, usedAsCondition)
            }
            case "local_vars_declaration": {
                if (node.parent?.type !== "match_expression") {
                    break
                }
                // match (val a = ...)
                return this.inferLocalVariablesDeclaration(node, flow)
            }
        }

        return ExprFlow.create(flow, usedAsCondition)
    }

    private inferLazyExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const argument = node.childForFieldName("argument")
        if (!argument) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const flowAfterArgument = this.inferExpression(
            argument,
            flow,
            usedAsCondition,
            hint,
        ).outFlow

        this.ctx.setType(node, this.ctx.getType(argument))
        return ExprFlow.create(flowAfterArgument, usedAsCondition)
    }

    private inferLambdaExpression(node: SyntaxNode, flow: FlowContext, hint: Ty | null): ExprFlow {
        const unwrappedHint = hint?.unwrapAlias()
        const callableTy = unwrappedHint instanceof FuncTy ? unwrappedHint : undefined
        const lambda = new Lambda(node, this.ctx.file)

        // Since lambda parameters can omit types, we need to infer it from the hint type
        // > fun call(f: (int) -> slice) { ... }
        // > call(fun(i) { ... })
        // then type of i is int
        const paramTypes: Ty[] = []
        const parameters = lambda.parameters()

        for (const [index, parameter] of parameters.entries()) {
            const typeNode = parameter.node.childForFieldName("type")
            if (typeNode) {
                const paramType = InferenceWalker.convertType(typeNode, this.ctx.file)
                if (paramType) {
                    paramTypes.push(paramType)
                }
            } else if (
                callableTy &&
                index < callableTy.params.length &&
                !callableTy.params[index].hasGenerics()
            ) {
                paramTypes.push(callableTy.params[index])
            }
        }

        // Same for return type
        // > fun call(f: (int) -> slice) { ... }
        // > call(fun(i) { ... })
        // return type is slice
        let explicitReturnType: Ty | null = null
        const returnTypeNode = node.childForFieldName("return_type")
        if (returnTypeNode) {
            explicitReturnType = InferenceWalker.convertType(returnTypeNode, this.ctx.file)
        } else if (callableTy && !callableTy.returnTy.hasGenerics()) {
            explicitReturnType = callableTy.returnTy
        }

        for (const [index, parameter] of parameters.entries()) {
            const parameterType = paramTypes[index] ?? UnknownTy.UNKNOWN
            this.ctx.setType(parameter.node, parameterType)

            const nameNode = parameter.node.childForFieldName("name")
            if (nameNode) {
                this.ctx.setType(nameNode, parameterType)
            }
        }

        let nextFlow = flow

        for (const [index, parameter] of parameters.entries()) {
            const parameterType = paramTypes[index] ?? UnknownTy.UNKNOWN
            nextFlow.setSymbol(parameter, parameterType)
        }

        // Save an old state to restore it after lambda is processed
        const oldReturnTypes = [...this.ctx.returnTypes]
        const oldUnreachable = flow.unreachable
        this.ctx.returnTypes = []

        const body = node.childForFieldName("body")
        if (body) {
            nextFlow = this.processBlockStatement(body, nextFlow)
        }

        // Here we infer the return type in the same way as for standalone functions
        const returnTy = explicitReturnType ?? this.inferReturnType(nextFlow)

        // And after body inference restore the old state
        this.ctx.returnTypes = oldReturnTypes
        nextFlow.unreachable = oldUnreachable

        const finalType = new FuncTy(paramTypes, returnTy)
        this.ctx.setType(node, finalType)

        return ExprFlow.create(nextFlow, false)
    }

    private inferGenericInstantiation(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const expr = node.childForFieldName("expr")
        const instantiationTs = node.childForFieldName("instantiationTs")

        if (!expr || !instantiationTs) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const flowAfterExpression = this.inferExpression(expr, flow, usedAsCondition, hint)
        const exprType = this.ctx.getType(expr)

        const typeNodes = instantiationTs.childrenForFieldName("types").filter(it => it?.isNamed)
        const types = typeNodes.map(
            it => InferenceWalker.convertType(it, this.ctx.file) ?? UnknownTy.UNKNOWN,
        )

        const resolved = this.ctx.getResolved(expr)

        if (
            resolved instanceof FunctionBase ||
            resolved instanceof Struct ||
            resolved instanceof TypeAlias
        ) {
            const typeParameters = resolved.typeParameters()

            const mapping: Map<string, Ty> = new Map()
            for (let i = 0; i < Math.min(typeParameters.length, types.length); i++) {
                mapping.set(typeParameters[i].name(), types[i])
            }

            const substituted = exprType?.substitute(mapping) ?? null
            this.ctx.setType(node, substituted)
            this.ctx.setResolved(node, resolved)
        }

        return ExprFlow.create(flowAfterExpression.outFlow, usedAsCondition)
    }

    private inferCallExpression(
        flow: FlowContext,
        node: SyntaxNode,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        let nextFlow = flow

        const call = new CallLike(node, this.ctx.file)
        const callee = call.callee()
        if (!callee) return ExprFlow.create(flow, usedAsCondition)

        this.inferExpression(callee, nextFlow, usedAsCondition)
        const type = this.ctx.getType(callee)
        const functionType = type instanceof FuncTy ? type : null

        if (!functionType) {
            // process arguments even function is unknown
            const args = call.arguments()
            for (const arg of args) {
                const argExpr = arg.childForFieldName("expr")
                if (!argExpr) continue

                nextFlow = this.inferExpression(argExpr, flow, false).outFlow
                const argType = this.ctx.getType(argExpr) ?? UnknownTy.UNKNOWN

                this.ctx.setType(argExpr, argType)
            }
            return ExprFlow.create(nextFlow, usedAsCondition)
        }

        let sub = new GenericSubstitutions()

        // infer generic parameters
        // val a = 100;
        // a = getT(); // T = int
        if (hint && functionType.returnTy.hasGenerics() && !hint.hasGenerics()) {
            sub = sub.deduce(functionType.returnTy, hint)
        }

        const resolvedFunc = this.ctx.getResolved(callee)
        let needSkipFirstParameter = resolvedFunc instanceof InstanceMethod // to skip self parameter

        if (resolvedFunc instanceof MethodBase) {
            const qualifier = call.calleeQualifier()

            if (resolvedFunc instanceof InstanceMethod) {
                const resolved = qualifier ? this.ctx.getResolved(qualifier) : null
                if (resolved instanceof Struct || resolved instanceof TypeAlias) {
                    // Call of instance method as static
                    needSkipFirstParameter = false
                }
            }

            const qualifierType = qualifier ? this.ctx.getType(qualifier) : UnknownTy.UNKNOWN
            const receiverType = InferenceWalker.convertType(
                resolvedFunc.receiverTypeNode(),
                resolvedFunc.file,
            )

            if (receiverType?.hasGenerics() && qualifierType) {
                sub = sub.deduce(receiverType, qualifierType)
            }
        }

        const paramTypes = needSkipFirstParameter
            ? functionType.params.slice(1)
            : functionType.params
        const args = call.arguments()

        // infer argument types with parameter types as hint
        for (let i = 0; i < Math.min(paramTypes.length, args.length); i++) {
            let paramType = paramTypes[i]
            if (paramType.hasGenerics()) {
                paramType = paramType.substitute(sub.mapping)
            }

            const arg = args[i]
            const argExpr = arg.childForFieldName("expr")
            if (!argExpr) continue

            nextFlow = this.inferExpression(argExpr, flow, false, paramType).outFlow
            let argType = this.ctx.getType(argExpr) ?? UnknownTy.UNKNOWN

            sub = sub.deduce(paramType, argType)
            argType = argType.substitute(sub.mapping)

            this.ctx.setType(argExpr, argType)
        }

        const returnType = functionType.returnTy.substitute(sub.mapping)

        this.ctx.setType(callee, functionType)
        this.ctx.setType(node, returnType)

        return ExprFlow.create(flow, usedAsCondition)
    }

    private inferDotExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const flowAfter = this.inferDotExpressionWithoutSmartcast(node, flow, usedAsCondition)
        const sinkExpression = this.extractSinkExpression(node)
        if (!sinkExpression) return flowAfter

        const sinkType = flowAfter.outFlow.getSinkType(sinkExpression)
        if (sinkType) {
            this.ctx.setType(node, sinkType)

            const fieldNode = node.childForFieldName("field")
            this.ctx.setType(fieldNode, sinkType)
        }

        return flowAfter
    }

    private inferDotExpressionWithoutSmartcast(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const qualifier = node.childForFieldName("obj")
        const fieldNode = node.childForFieldName("field")
        if (!qualifier || !fieldNode) return ExprFlow.create(flow, usedAsCondition)

        const flowAfterQualifier = this.inferExpression(qualifier, flow, usedAsCondition)
        const qualifierType = this.ctx.getType(qualifier) ?? UnknownTy.UNKNOWN
        const baseType = qualifierType.baseType()

        if (fieldNode.type === "numeric_index") {
            // foo.0
            if (baseType instanceof TupleTy || baseType instanceof TensorTy) {
                const idx = Number.parseInt(fieldNode.text)
                const ty = baseType.elements.at(idx) ?? UnknownTy.UNKNOWN
                this.ctx.setType(node, ty)
                this.ctx.setType(fieldNode, ty)
                return ExprFlow.create(flowAfterQualifier.outFlow, usedAsCondition)
            }
        }

        let resolved: NamedNode | null = null

        if (baseType instanceof StructTy) {
            for (const field of baseType.fields()) {
                if (field.name(false) === fieldNode.text) {
                    resolved = field

                    const structTy = baseType.anchor
                        ? InferenceWalker.namedNodeType(baseType.anchor)
                        : null
                    const sub = GenericSubstitutions.deduce(structTy, qualifierType.unwrapAlias())

                    this.ctx.setResolved(node, resolved)
                    this.ctx.setResolved(fieldNode, resolved)

                    const type =
                        InferenceWalker.convertType(field.typeNode()?.node, field.file)?.substitute(
                            sub.mapping,
                        ) ?? null

                    this.ctx.setType(node, type)
                    this.ctx.setType(fieldNode, type)
                    break
                }
            }
        }

        if (baseType instanceof EnumTy) {
            for (const member of baseType.members()) {
                if (member.name(false) === fieldNode.text) {
                    resolved = member

                    this.ctx.setResolved(node, resolved)
                    this.ctx.setResolved(fieldNode, resolved)

                    this.ctx.setType(node, baseType)
                    this.ctx.setType(fieldNode, baseType)
                    break
                }
            }
        }

        if (resolved) {
            return ExprFlow.create(flowAfterQualifier.outFlow, usedAsCondition)
        }

        const searchName = trimBackticks(fieldNode.text)
        const methodCandidates = this.methodCandidates(qualifierType, searchName)

        if (methodCandidates.length === 1) {
            resolved = methodCandidates[0]
            const type = InferenceWalker.namedNodeType(resolved)
            this.ctx.setType(node, type)
            this.ctx.setType(fieldNode, type)
        }

        this.ctx.setResolved(node, resolved)
        this.ctx.setResolved(fieldNode, resolved)

        return ExprFlow.create(flowAfterQualifier.outFlow, usedAsCondition)
    }

    private processMethodsInIndex(
        searchName: string,
        onMethod: (method: MethodBase) => boolean,
        fileIndex: IndexFinder,
    ): boolean {
        return fileIndex.processElementsByKey(
            IndexKey.Methods,
            new (class implements ScopeProcessor {
                public execute(node: InstanceMethod | StaticMethod): boolean {
                    const name = node.name()
                    if (name !== searchName) return true // fast path
                    return onMethod(node)
                }
            })(),
            new ResolveState(),
        )
    }

    private processMethods(searchName: string, onMethod: (method: MethodBase) => boolean): void {
        // fast path, check the current file
        const fileIndex = index.findFile(this.ctx.file.uri)
        if (fileIndex) {
            if (!this.processMethodsInIndex(searchName, onMethod, fileIndex)) return
        }

        const commonFile = index.stdlibRoot?.findRelativeFile("common.tolk")
        if (commonFile) {
            if (!this.processMethodsInIndex(searchName, onMethod, commonFile)) return
        }

        const stubsFile = index.stubsRoot?.findRelativeFile("stubs.tolk")
        if (stubsFile) {
            if (!this.processMethodsInIndex(searchName, onMethod, stubsFile)) return
        }

        // process imported file
        for (const path of this.ctx.file.importedFiles()) {
            const fileIndex = index.findFile(filePathToUri(path))
            if (!fileIndex) continue

            if (!this.processMethodsInIndex(searchName, onMethod, fileIndex)) return
        }
    }

    private methodCandidates(qualifierType: Ty, searchName: string): MethodBase[] {
        const result: MethodBase[] = []

        // step1: find all methods where a receiver type text equals to provided, e.g. `MInt.copy`
        // on this step we do raw search for string equivalence (in most cases this way is okay)
        const qualifierTypeString = qualifierType.name()
        this.processMethods(searchName, method => {
            const receiverTypeString = method.receiverTypeString()
            if (qualifierTypeString === receiverTypeString) {
                // fast path, if types are equal, it is an exact match, no need to search for more methods
                result.push(method)
                return false
            }
            return true
        })

        if (result.length > 0) {
            return result
        }

        // step1.1: find all methods where a receiver equals to provided, e.g. `[int, int].copy`
        // here we do real type equality comparison
        this.processMethods(searchName, method => {
            const receiverTypeNode = method.receiverTypeNode()
            if (!receiverTypeNode) return true
            const receiverType = InferenceWalker.convertType(receiverTypeNode, this.ctx.file)

            if (!receiverType?.hasGenerics() && receiverType?.equals(qualifierType)) {
                result.push(method)
                return false
            }
            return true
        })

        if (result.length > 0) {
            return result
        }

        // step2: find all methods where a receiver can accept provided, e.g. `int8.copy` / `int?.copy` / `(int|slice).copy`
        this.processMethods(searchName, method => {
            const receiverTypeNode = method.receiverTypeNode()
            if (!receiverTypeNode) return true
            const receiverType = InferenceWalker.convertType(receiverTypeNode, this.ctx.file)

            if (!receiverType?.hasGenerics() && receiverType?.canRhsBeAssigned(qualifierType)) {
                result.push(method)
                return false
            }
            return true
        })

        if (result.length > 0) {
            return result
        }

        // step 3: try to match generic receivers, e.g. `Container<T>.copy` / `(T?|slice).copy` but NOT `T.copy`
        const qualifierBaseType = qualifierType.baseType()
        this.processMethods(searchName, method => {
            const receiverTypeNode = method.receiverTypeNode()
            if (!receiverTypeNode) return true
            const receiverType = InferenceWalker.convertType(receiverTypeNode, this.ctx.file)

            // Foo<T>, but not T
            if (receiverType?.hasGenerics() && !(receiverType instanceof TypeParameterTy)) {
                const receiverBaseType = receiverType.baseType()

                if (qualifierBaseType instanceof StructTy && receiverBaseType instanceof StructTy) {
                    if (!qualifierBaseType.equals(receiverBaseType)) {
                        // different struct names
                        return true
                    }
                }

                const subst = GenericSubstitutions.deduce(receiverType, qualifierType)
                const substituted = receiverType.substitute(subst.mapping)

                if (!substituted.hasGenerics()) {
                    result.push(method)
                    return false
                }
            }
            return true
        })

        if (result.length > 0) {
            return result
        }

        // step 4: try to match `T.copy`
        this.processMethods(searchName, method => {
            const receiverTypeNode = method.receiverTypeNode()
            if (!receiverTypeNode) return true
            const receiverType = InferenceWalker.convertType(receiverTypeNode, this.ctx.file)

            if (receiverType instanceof TypeParameterTy) {
                result.push(method)
                return false
            }
            return true
        })

        return result
    }

    private inferMatchExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const expression = node.childForFieldName("expr")
        if (!expression) return ExprFlow.create(flow, usedAsCondition)

        const afterExpr = this.inferExpression(expression, flow, false).outFlow
        const sinkExpression = this.extractSinkExpression(expression)

        const exprType = this.ctx.getType(expression)?.unwrapAlias() ?? UnknownTy.UNKNOWN

        const armsEntryFlow = afterExpr.clone()

        let matchOutFlow: FlowContext | null = null
        let unifiedType: Ty | null = null

        const body = node.childForFieldName("body")
        const arms = body?.namedChildren.filter(it => it?.type === "match_arm") ?? []

        for (const arm of arms) {
            if (!arm) continue

            const armPatternType = arm.childForFieldName("pattern_type")
            const armPatternExpr = arm.childForFieldName("pattern_expr")
            const armPatternElse = arm.childForFieldName("pattern_else")
            const armPatternExpression = armPatternType ?? armPatternExpr ?? armPatternElse

            let armFlow: FlowContext | null = null
            if (armPatternExpression) {
                armFlow = this.inferExpression(
                    armPatternExpression,
                    armsEntryFlow.clone(),
                    usedAsCondition,
                ).outFlow
            }

            armFlow ??= armsEntryFlow.clone()

            if (armPatternType) {
                let armType =
                    this.ctx.getType(armPatternType) ??
                    InferenceWalker.convertType(armPatternType, this.ctx.file)

                if (
                    armType instanceof InstantiationTy &&
                    armType.innerTy instanceof StructTy &&
                    armType.types.every(it => it instanceof TypeParameterTy)
                ) {
                    armType =
                        this.tryPickInstantiatedGenericFromHint(exprType, armType.innerTy) ??
                        armType
                }

                if (sinkExpression && armType) {
                    armFlow.setSink(sinkExpression, armType)
                }
            }

            if (armPatternExpression?.type === "identifier") {
                const resolved = Reference.resolve(
                    new NamedNode(armPatternExpression, this.ctx.file),
                )

                const syncExprType = resolved ? this.ctx.getType(resolved.node) : null

                if (sinkExpression && syncExprType) {
                    armFlow.setSink(sinkExpression, syncExprType)
                }
            }

            const armBlock = arm.childForFieldName("block")
            if (armBlock) {
                armFlow = this.inferStatement(armBlock, armFlow)
                matchOutFlow = matchOutFlow ? matchOutFlow.join(armFlow) : armFlow
                continue
            }

            const armExpression = arm.childForFieldName("expr")
            if (armExpression) {
                armFlow = this.inferExpression(armExpression, armFlow, usedAsCondition).outFlow
                matchOutFlow = matchOutFlow ? matchOutFlow.join(armFlow) : armFlow
                const exprType = this.ctx.getType(armExpression)
                if (exprType) {
                    unifiedType = unifiedType ? joinTypes(exprType, unifiedType) : exprType
                }
                continue
            }

            const armReturn = arm.childForFieldName("return")
            if (armReturn) {
                armFlow = this.inferStatement(armReturn, armFlow)
                matchOutFlow = matchOutFlow ? matchOutFlow.join(armFlow) : armFlow
                continue
            }

            const armThrow = arm.childForFieldName("throw")
            if (armThrow) {
                armFlow = this.inferStatement(armThrow, armFlow)
                matchOutFlow = matchOutFlow ? matchOutFlow.join(armFlow) : armFlow
            }
        }

        this.ctx.setType(node, unifiedType)
        return ExprFlow.create(matchOutFlow ?? afterExpr, usedAsCondition)
    }

    private inferObjectLiteralExpression(
        flow: FlowContext,
        node: SyntaxNode,
        hint: Ty | null,
    ): ExprFlow {
        const nextFlow = ExprFlow.create(flow, false)

        const typeNode = node.childForFieldName("type")
        let structType = typeNode ? InferenceWalker.convertType(typeNode, this.ctx.file) : null

        if (structType === null && hint) {
            // val foo: Foo = { ... }
            //          ^^^ hint
            const hintBase = hint.baseType()
            if (hintBase instanceof StructTy) {
                structType = hint
            }
            if (hintBase instanceof UnionTy) {
                let found = 0
                let lastStruct: Ty | null = null
                for (const hintVariant of hintBase.elements) {
                    const unwrappedHint = hintVariant.baseType()
                    if (unwrappedHint instanceof StructTy) {
                        lastStruct = hintVariant
                        found++
                    }
                }
                if (found == 1) {
                    structType = lastStruct
                }
            }
        }

        const argsNode = node.childForFieldName("arguments")
        const args = argsNode?.namedChildren ?? []

        const baseType = structType?.baseType()
        if (!(baseType instanceof StructTy)) {
            return nextFlow
        }

        let sub = new GenericSubstitutions()
        if (baseType.anchor && structType) {
            sub = sub.deduce(InferenceWalker.namedNodeType(baseType.anchor), structType)
        }

        if (
            hint &&
            structType instanceof InstantiationTy &&
            structType.innerTy instanceof StructTy
        ) {
            const innerHint = this.tryPickInstantiatedGenericFromHint(hint, structType.innerTy)
            if (innerHint) {
                sub = sub.deduce(structType, innerHint)
            }
        }

        if (hint instanceof InstantiationTy && structType instanceof InstantiationTy) {
            sub = sub.deduce(structType, hint)
        }

        for (const arg of args) {
            if (!arg) continue

            const nameNode = arg.childForFieldName("name")
            const name = nameNode?.text ?? ""
            const value = arg.childForFieldName("value")
            const isLongSyntax = value !== null || nameNode?.nextSibling?.text === ":"

            if (isLongSyntax) {
                // Foo { field: value }
                //       ^^^^^^^^^^^^
                const resolved = baseType.fields().find(it => it.name(false) === name)
                const originalFieldType = InferenceWalker.convertType(
                    resolved?.typeNode()?.node,
                    resolved?.file,
                )

                let fieldType = originalFieldType
                if (fieldType && fieldType.hasGenerics()) {
                    fieldType = fieldType.substitute(sub.mapping)
                }

                if (value) {
                    this.inferExpression(value, nextFlow.outFlow, false, fieldType)
                }

                const valueType = value ? this.ctx.getType(value) : UnknownTy.UNKNOWN
                if (originalFieldType && valueType) {
                    sub = sub.deduce(originalFieldType, valueType.unwrapAlias())
                    const subType = valueType.substitute(sub.mapping)
                    this.ctx.setType(value, subType)

                    if (nameNode) {
                        const fieldSubType = originalFieldType.substitute(sub.mapping)
                        this.ctx.setType(nameNode, fieldSubType)
                    }
                } else if (nameNode) {
                    this.ctx.setType(nameNode, fieldType)
                }
            } else if (nameNode) {
                // Foo { foo }
                //       ^^^
                // foo is a local variable or parameter
                const resolved = Reference.resolve(
                    new NamedNode(nameNode, this.ctx.file),
                    false,
                    true, // only block variables/parameters
                )
                if (!resolved) continue

                if (
                    resolved.node.type === "var_declaration" ||
                    resolved.node.type === "parameter_declaration"
                ) {
                    const resolvedField = baseType.fields().find(it => it.name(false) === name)
                    let fieldType = InferenceWalker.convertType(
                        resolvedField?.typeNode()?.node,
                        resolvedField?.file,
                    )

                    if (fieldType && fieldType.hasGenerics()) {
                        fieldType = fieldType.substitute(sub.mapping)
                    }

                    const sink = new SinkExpression(resolved)
                    const variableType = flow.getSinkType(sink) ?? this.ctx.getType(resolved.node)

                    if (fieldType && variableType) {
                        sub = sub.deduce(fieldType, variableType.baseType())
                        const subType = variableType.substitute(sub.mapping)

                        this.ctx.setType(nameNode, subType)
                    } else {
                        this.ctx.setType(nameNode, variableType)
                    }
                }
            }
        }

        if (structType && structType.hasGenerics()) {
            this.ctx.setType(node, structType.substitute(sub.mapping))
        } else {
            this.ctx.setType(node, structType)
        }

        return nextFlow
    }

    private inferIsExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const expr = node.childForFieldName("expr")
        const operator = node.childForFieldName("operator")
        if (!expr || !operator) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const flowAfterExpression = this.inferExpression(expr, flow, false)

        const typeNode = node.childForFieldName("rhs_type")
        if (!typeNode) {
            return flowAfterExpression
        }

        const exprType = this.ctx.getType(expr)?.unwrapAlias() ?? UnknownTy.UNKNOWN
        let rightType = InferenceWalker.convertType(typeNode, this.ctx.file) ?? UnknownTy.UNKNOWN

        if (
            rightType instanceof InstantiationTy &&
            rightType.innerTy instanceof StructTy &&
            rightType.types.every(it => it instanceof TypeParameterTy)
        ) {
            rightType =
                this.tryPickInstantiatedGenericFromHint(exprType, rightType.innerTy) ?? rightType
        }

        const nonRightType = subtractTypes(exprType, rightType)
        const isNegated = operator.text === "!is"

        let resultType = BoolTy.BOOL
        if (exprType.equals(rightType)) {
            // `expr is <type>` is always true if expr has <type> type
            resultType = isNegated ? BoolTy.FALSE : BoolTy.TRUE
        } else if (nonRightType instanceof NeverTy) {
            // `expr is <type>` is always false if expr is not <type> in any way
            resultType = isNegated ? BoolTy.TRUE : BoolTy.FALSE
        }

        this.ctx.setType(node, resultType)

        if (!usedAsCondition) {
            return flowAfterExpression
        }

        const trueFlow = FlowContext.from(flowAfterExpression.outFlow)
        const falseFlow = FlowContext.from(flowAfterExpression.outFlow)

        const sinkExpr = this.extractSinkExpression(expr)
        if (!sinkExpr) return flowAfterExpression

        if (resultType === BoolTy.TRUE) {
            falseFlow.unreachable = UnreachableKind.CantHappen
            falseFlow.setSink(sinkExpr, NeverTy.NEVER)
        } else if (resultType === BoolTy.FALSE) {
            trueFlow.unreachable = UnreachableKind.CantHappen
            trueFlow.setSink(sinkExpr, NeverTy.NEVER)
        } else if (isNegated) {
            trueFlow.setSink(sinkExpr, nonRightType)
            falseFlow.setSink(sinkExpr, rightType)
        } else {
            trueFlow.setSink(sinkExpr, rightType)
            falseFlow.setSink(sinkExpr, nonRightType)
        }

        return new ExprFlow(flowAfterExpression.outFlow, trueFlow, falseFlow)
    }

    // helper function: given hint = `Ok<int> | Err<slice>` and struct `Ok`, return `Ok<int>`
    // example: `match (...) { Ok => ... }` we need to deduce `Ok<T>` based on subject
    private tryPickInstantiatedGenericFromHint(hint: Ty, lookup: StructTy): Ty | null {
        const unwrapped = hint.unwrapAlias()

        // example: `var w: Ok<int> = Ok { ... }`, hint is `Ok<int>`, lookup is `Ok`
        if (unwrapped instanceof InstantiationTy && unwrapped.innerTy instanceof StructTy) {
            if (unwrapped.innerTy.name() === lookup.name()) {
                return unwrapped
            }
        }

        // example: `fun f(): Response<int, slice> { return Err { ... } }`, hint is `Ok<int> | Err<slice>`, lookup is `Err`
        if (unwrapped instanceof UnionTy) {
            let onlyVariant: InstantiationTy | null = null

            for (const variant of unwrapped.elements) {
                const unwrappedVariant = variant.unwrapAlias()
                if (
                    unwrappedVariant instanceof InstantiationTy &&
                    unwrappedVariant.innerTy instanceof StructTy
                ) {
                    if (unwrappedVariant.innerTy.name() === lookup.name()) {
                        if (onlyVariant !== null) {
                            return null
                        }
                        onlyVariant = unwrappedVariant
                    }
                }
            }

            return onlyVariant
        }

        return null
    }

    private inferBinaryExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const operator = node.childForFieldName("operator_name")?.text
        if (!operator) return ExprFlow.create(flow, usedAsCondition)

        const left = node.children[0]
        if (!left) return ExprFlow.create(flow, usedAsCondition)

        const right = node.children[2]

        switch (operator) {
            case "<":
            case ">":
            case "<=":
            case ">=":
            case "<=>":
            case "!=":
            case "==": {
                const isInverted = operator === "!="
                if (operator === "!=" || operator == "==") {
                    if (left.type === "null_literal" && right !== null) {
                        return this.inferIsNullCheck(node, right, isInverted, flow, usedAsCondition)
                    } else if (right?.type === "null_literal") {
                        return this.inferIsNullCheck(node, left, isInverted, flow, usedAsCondition)
                    }
                }

                flow = this.inferExpression(left, flow, false).outFlow
                if (!right) {
                    return ExprFlow.create(flow, usedAsCondition)
                }

                flow = this.inferExpression(right, flow, false).outFlow
                this.ctx.setType(node, BoolTy.BOOL)
                break
            }

            case "&&": {
                this.ctx.setType(node, BoolTy.BOOL)
                const flowAfterLeft = this.inferExpression(left, flow, true)
                if (!right) {
                    return ExprFlow.create(flowAfterLeft.outFlow, usedAsCondition)
                }

                const flowAfterRight = this.inferExpression(right, flowAfterLeft.trueFlow, true)
                if (!usedAsCondition) {
                    const outFlow = flowAfterLeft.falseFlow.join(flowAfterRight.outFlow)
                    return ExprFlow.create(outFlow, false)
                }

                const outFlow = flowAfterLeft.outFlow.join(flowAfterRight.outFlow)
                const trueFlow = flowAfterRight.trueFlow
                const falseFlow = flowAfterLeft.falseFlow.join(flowAfterRight.falseFlow)

                return new ExprFlow(outFlow, trueFlow, falseFlow)
            }
            case "||": {
                this.ctx.setType(node, BoolTy.BOOL)
                const flowAfterLeft = this.inferExpression(left, flow, true)
                if (!right) {
                    return ExprFlow.create(flowAfterLeft.outFlow, usedAsCondition)
                }

                const flowAfterRight = this.inferExpression(right, flowAfterLeft.falseFlow, true)
                if (!usedAsCondition) {
                    const outFlow = flowAfterLeft.trueFlow.join(flowAfterRight.outFlow)
                    return ExprFlow.create(outFlow, false)
                }

                const outFlow = flowAfterLeft.outFlow.join(flowAfterRight.outFlow)
                const trueFlow = flowAfterLeft.trueFlow.join(flowAfterRight.trueFlow)
                // noinspection UnnecessaryLocalVariableJS
                const falseFlow = flowAfterRight.falseFlow

                return new ExprFlow(outFlow, trueFlow, falseFlow)
            }
            case "&":
            case "|": {
                flow = this.inferExpression(left, flow, false).outFlow
                if (!right) {
                    return ExprFlow.create(flow, usedAsCondition)
                }

                flow = this.inferExpression(right, flow, false).outFlow

                const leftType = this.ctx.getType(left)
                if (leftType instanceof BoolTy) {
                    this.ctx.setType(node, BoolTy.BOOL)
                    break
                }

                this.ctx.setType(node, IntTy.INT)
                break
            }
            case "??": {
                const flowAfterLeft = this.inferExpression(left, flow, false)
                const leftType = this.ctx.getType(left) ?? UnknownTy.UNKNOWN
                if (!right) {
                    this.ctx.setType(node, leftType)
                    return ExprFlow.create(flowAfterLeft.outFlow, usedAsCondition)
                }

                const rhsFlow = flowAfterLeft.outFlow.clone()
                const sinkExpr = this.extractSinkExpression(left)
                if (sinkExpr) {
                    rhsFlow.setSink(sinkExpr, NullTy.NULL)
                }

                const flowAfterRight = this.inferExpression(right, rhsFlow, false)

                const withoutNullType = subtractTypes(leftType, NullTy.NULL)
                if (leftType instanceof NullTy) {
                    this.ctx.setType(node, this.ctx.getType(right))
                } else if (withoutNullType instanceof NeverTy) {
                    rhsFlow.unreachable = UnreachableKind.CantHappen
                    this.ctx.setType(node, leftType)
                } else {
                    const rightType = this.ctx.getType(right) ?? UnknownTy.UNKNOWN
                    const resultType = joinTypes(withoutNullType, rightType)
                    this.ctx.setType(node, resultType)
                }

                const outFlow = flowAfterLeft.outFlow.join(flowAfterRight.outFlow)
                return ExprFlow.create(outFlow, usedAsCondition)
            }
            default: {
                flow = this.inferExpression(left, flow, false).outFlow
                if (!right) {
                    return ExprFlow.create(flow, usedAsCondition)
                }

                flow = this.inferExpression(right, flow, false).outFlow

                const leftType = this.ctx.getType(left)
                if ((operator === "+" || operator === "-") && leftType instanceof CoinsTy) {
                    // coins + coins = coins
                    this.ctx.setType(node, CoinsTy.COINS)
                    break
                }

                this.ctx.setType(node, IntTy.INT)
                break
            }
        }

        return ExprFlow.create(flow, usedAsCondition)
    }

    private inferIsNullCheck(
        node: SyntaxNode,
        expr: SyntaxNode,
        isInverted: boolean,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const flowAfterExpression = this.inferExpression(expr, flow, false)
        const exprType = this.ctx.getType(expr)?.unwrapAlias()
        if (!exprType) return flowAfterExpression

        const notNullType = subtractTypes(exprType, NullTy.NULL)

        let resultType = BoolTy.BOOL
        if (exprType instanceof NullTy) {
            // `expr == null` is always true if expr has null
            resultType = isInverted ? BoolTy.FALSE : BoolTy.TRUE
        } else if (notNullType instanceof NeverTy) {
            // `expr == null` is always false if expr is not nullable
            resultType = isInverted ? BoolTy.TRUE : BoolTy.FALSE
        }

        this.ctx.setType(node, resultType)

        if (!usedAsCondition) {
            return flowAfterExpression
        }

        const trueFlow = FlowContext.from(flowAfterExpression.outFlow)
        const falseFlow = FlowContext.from(flowAfterExpression.outFlow)

        const sinkExpr = this.extractSinkExpression(expr)
        if (!sinkExpr) return flowAfterExpression

        if (resultType === BoolTy.TRUE) {
            falseFlow.unreachable = UnreachableKind.CantHappen
            falseFlow.setSink(sinkExpr, NeverTy.NEVER)
        } else if (resultType === BoolTy.FALSE) {
            trueFlow.unreachable = UnreachableKind.CantHappen
            trueFlow.setSink(sinkExpr, NeverTy.NEVER)
        } else if (isInverted) {
            trueFlow.setSink(sinkExpr, notNullType)
            falseFlow.setSink(sinkExpr, NullTy.NULL)
        } else {
            trueFlow.setSink(sinkExpr, NullTy.NULL)
            falseFlow.setSink(sinkExpr, notNullType)
        }

        return new ExprFlow(flowAfterExpression.outFlow, trueFlow, falseFlow)
    }

    private inferReferenceExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const nextFlow = ExprFlow.create(flow, usedAsCondition)

        const resolved = Reference.resolve(new NamedNode(node, this.ctx.file))
        if (!resolved) return nextFlow

        this.ctx.setResolved(node, resolved)

        if (resolved.name() === "self" && resolved.node.type === "parameter_declaration") {
            const sink = new SinkExpression(resolved)
            const type = flow.getSinkType(sink) ?? this.ctx.selfType

            this.ctx.setType(node, type)
            return nextFlow
        }

        if (
            resolved.node.type === "var_declaration" ||
            resolved.node.type === "parameter_declaration"
        ) {
            const sink = new SinkExpression(resolved)
            const type = flow.getSinkType(sink) ?? this.ctx.getType(resolved.node)

            this.ctx.setType(node, type)
            return nextFlow
        }

        if (
            resolved.node.type === "function_declaration" ||
            resolved.node.type === "method_declaration" ||
            resolved.node.type === "get_method_declaration"
        ) {
            const type = InferenceWalker.namedNodeType(resolved)
            this.ctx.setType(resolved.node, type)
            this.ctx.setType(node, type)
            return nextFlow
        }

        if (resolved instanceof TypeAlias) {
            const underlyingType = resolved.underlyingType()
            if (underlyingType?.text === "builtin") {
                const name = resolved.name()
                const type = InferenceWalker.asPrimitiveType(node.text)
                if (type) {
                    this.ctx.setType(node, type)
                    return nextFlow
                }
                this.ctx.setType(node, new BuiltinTy(name, resolved))
                return nextFlow
            }

            this.ctx.setType(node, InferenceWalker.namedNodeType(resolved))
            return nextFlow
        }

        if (resolved instanceof Struct) {
            this.ctx.setType(node, InferenceWalker.namedNodeType(resolved))
            return nextFlow
        }

        if (resolved instanceof Enum) {
            this.ctx.setType(node, resolved.declaredType())
            return nextFlow
        }

        if (resolved instanceof Constant) {
            this.ctx.setType(node, resolved.declaredType())
            return nextFlow
        }

        if (resolved instanceof GlobalVariable) {
            this.ctx.setType(node, resolved.declaredType())
            return nextFlow
        }

        const symbol = flow.symbols.get(node.text)
        if (symbol) {
            const sink = new SinkExpression(resolved)
            const variableType = flow.getSinkType(sink) ?? flow.getType(resolved.node)

            this.ctx.setType(node, variableType)
            return nextFlow
        }

        return nextFlow
    }

    private inferLocalVariablesDeclaration(node: SyntaxNode, flow: FlowContext): ExprFlow {
        const lhs = node.childForFieldName("lhs")
        if (!lhs) return ExprFlow.create(flow, false)

        const nextFlow = this.inferLeftSideVarAssigment(lhs, flow)

        const rhs = node.childForFieldName("assigned_val")
        if (!rhs) return ExprFlow.create(nextFlow, false)

        const varDefinitionType = this.ctx.getType(lhs)
        const nextExprFlow = this.inferExpression(
            rhs,
            nextFlow,
            false,
            varDefinitionType instanceof UnknownTy ? null : varDefinitionType,
        )
        const exprType = this.ctx.getType(rhs) ?? UnknownTy.UNKNOWN

        this.processVarDefinitionAfterRight(lhs, exprType, nextExprFlow.outFlow)
        this.ctx.setType(node, exprType)

        return nextExprFlow
    }

    private inferLeftSideVarAssigment(node: SyntaxNode, flow: FlowContext): FlowContext {
        let nextFlow = flow

        if (node.type === "var_declaration") {
            const typeNode = node.childForFieldName("type")
            const type = typeNode
                ? InferenceWalker.convertType(typeNode, this.ctx.file)
                : UnknownTy.UNKNOWN
            this.ctx.setVarType(node, type)
            this.ctx.setVarType(node.childForFieldName("name"), type)
            nextFlow.setSymbol(new NamedNode(node, this.ctx.file), type ?? UnknownTy.UNKNOWN)
        }

        if (node.type === "tensor_vars_declaration") {
            const elements = node.childrenForFieldName("vars").filter(it => it?.isNamed)
            if (elements.length === 1) {
                // var ([a, b, c]) = [...]
                // ->
                // var [a, b, c] = [...]
                const first = elements[0]
                if (first) {
                    return this.inferLeftSideVarAssigment(first, flow)
                }
            }

            const types: Ty[] = []

            for (const element of elements) {
                if (!element) continue

                nextFlow = this.inferLeftSideVarAssigment(element, nextFlow)
                const elementType = this.ctx.getType(element) ?? UnknownTy.UNKNOWN
                types.push(elementType)
            }

            const type = new TensorTy(types)
            this.ctx.setType(node, type)
        }

        if (node.type === "tuple_vars_declaration") {
            const elements = node.childrenForFieldName("vars").filter(it => it?.isNamed)
            const types: Ty[] = []

            for (const element of elements) {
                if (!element) continue

                nextFlow = this.inferLeftSideVarAssigment(element, nextFlow)
                const elementType = this.ctx.getType(element) ?? UnknownTy.UNKNOWN
                types.push(elementType)
            }

            const type = new TupleTy(types)
            this.ctx.setType(node, type)
        }

        return flow
    }

    public static convertType(
        typeNode: SyntaxNode | null | undefined,
        file: TolkFile | null | undefined,
    ): Ty | null {
        if (!typeNode || !file) return null
        return TOLK_CACHE.typeCache.cached(typeNode.id, () => {
            // add unknown type to avoid recursion
            TOLK_CACHE.typeCache.setValue(typeNode.id, UnknownTy.UNKNOWN)
            return InferenceWalker.convertTypeImpl(typeNode, file)
        })
    }

    private static convertTypeImpl(node: SyntaxNode | null | undefined, file: TolkFile): Ty | null {
        if (!node) return null

        if (node.type === "type_identifier") {
            const name = node.text
            if (name === "self") {
                return InferenceWalker.inferSelfType(node, file)
            }

            const type = InferenceWalker.asPrimitiveType(name)
            if (type) {
                return type
            }

            const resolved = Reference.resolve(new NamedNode(node, file))
            if (resolved === null) return null
            return this.namedNodeType(resolved)
        }

        if (node.type === "null_literal") {
            return NullTy.NULL
        }

        if (node.type === "nullable_type") {
            const inner = node.childForFieldName("inner")
            if (!inner) return null
            const innerType = InferenceWalker.convertType(inner, file)
            if (innerType === null) return null
            return UnionTy.create([innerType, NullTy.NULL])
        }

        if (node.type === "tensor_type" || node.type === "tuple_type") {
            const expressions = node.namedChildren.filter(it => it !== null)

            const types = expressions.map(
                it => InferenceWalker.convertType(it, file) ?? UnknownTy.UNKNOWN,
            )

            if (node.type === "tensor_type") {
                return new TensorTy(types)
            }

            return new TupleTy(types)
        }

        if (node.type === "parenthesized_type") {
            const inner = node.childForFieldName("inner")
            if (!inner) return null
            return InferenceWalker.convertType(inner, file)
        }

        if (node.type === "type_instantiatedTs") {
            const nameNode = node.childForFieldName("name")
            const argsNode = node.childForFieldName("arguments")
            if (!nameNode || !argsNode) return null

            const namedNode = new NamedNode(nameNode, file)
            const resolved = Reference.resolve(namedNode)

            const innerTy = InferenceWalker.convertType(nameNode, file)?.unwrapInstantiation()
            if (!innerTy) return null

            const args = argsNode.namedChildren.filter(it => it !== null)

            const argsTypes = args.map(
                it => InferenceWalker.convertType(it, file) ?? UnknownTy.UNKNOWN,
            )

            if (resolved instanceof Struct || resolved instanceof TypeAlias) {
                const mapping: Map<string, Ty> = new Map()
                const typeParameters = resolved.typeParameters()

                for (let i = 0; i < Math.min(typeParameters.length, argsTypes.length); i++) {
                    const param = typeParameters[i]
                    const type = argsTypes[i]

                    mapping.set(param.name(), type)
                }

                return new InstantiationTy(innerTy, argsTypes).substitute(mapping)
            }

            return new InstantiationTy(innerTy, argsTypes)
        }

        if (node.type === "fun_callable_type") {
            const paramTypeNode = node.childForFieldName("param_types")
            const returnTypeNode = node.childForFieldName("return_type")

            if (!paramTypeNode || !returnTypeNode) return null

            const paramType = InferenceWalker.convertType(paramTypeNode, file)
            const returnType = InferenceWalker.convertType(returnTypeNode, file)

            if (!paramType || !returnType) return null

            const paramTypes = paramType instanceof TensorTy ? paramType.elements : [paramType]

            return new FuncTy(paramTypes, returnType)
        }

        if (node.type === "union_type") {
            const types = this.convertUnionType(node, file)
            if (!types) return null
            return UnionTy.create(types)
        }

        return null
    }

    private static inferSelfType(node: SyntaxNode, file: TolkFile): Ty | null {
        const methodOwner = parentOfType(node, "method_declaration")
        if (!methodOwner) {
            return null
        }

        const method = new MethodBase(methodOwner, file)
        const receiver = method.receiverTypeNode()
        if (receiver) {
            return this.convertType(receiver, file)
        }
        return null
    }

    private static convertUnionType(node: SyntaxNode, file: TolkFile): Ty[] | null {
        // TODO: self recursive types
        const lhs = node.childForFieldName("lhs")
        const rhs = node.childForFieldName("rhs")

        if (!lhs || !rhs) return null

        const lhsTy = InferenceWalker.convertType(lhs, file)
        if (!lhsTy) return null

        if (rhs.type === "union_type") {
            const rhsTypes = this.convertUnionType(rhs, file)
            if (!rhsTypes) return null
            return [lhsTy, ...rhsTypes]
        }

        const rhsTy = InferenceWalker.convertType(rhs, file)
        if (!rhsTy) return null

        return [lhsTy, rhsTy]
    }

    public static namedNodeType(node: NamedNode): Ty | null {
        return TOLK_CACHE.typeCache.cachedIf(node.node.id, UnknownTy.UNKNOWN, () =>
            InferenceWalker.namedNodeTypeImpl(node),
        )
    }

    public static namedNodeTypeImpl(node: NamedNode): Ty | null {
        if (node instanceof Struct) {
            const fieldTypes = node.fields().map(it => {
                try {
                    return (
                        InferenceWalker.convertType(it.typeNode()?.node, node.file) ??
                        UnknownTy.UNKNOWN
                    )
                } catch {
                    // cyclic dependency
                    return UnknownTy.UNKNOWN
                }
            })

            const baseTy = new StructTy(fieldTypes, node.name(), node)

            const typeParameters = node.typeParameters()
            if (typeParameters.length > 0) {
                return new InstantiationTy(
                    baseTy,
                    typeParameters.map(it => {
                        const defaultTypeNode = it.defaultType()
                        if (defaultTypeNode) {
                            const defaultType = InferenceWalker.convertType(
                                defaultTypeNode,
                                node.file,
                            )
                            return new TypeParameterTy(it, defaultType)
                        }
                        return new TypeParameterTy(it)
                    }),
                )
            }

            return baseTy
        }
        if (node instanceof TypeAlias) {
            const underlyingType = node.underlyingType()
            if (underlyingType === null) return null

            if (underlyingType.type === "builtin_specifier") {
                const name = node.name()
                const type = InferenceWalker.asPrimitiveType(name)
                if (type) {
                    return type
                }
                return new BuiltinTy(name, node)
            }

            const innerTy = InferenceWalker.convertType(underlyingType, node.file)
            if (!innerTy) return null

            const baseTy = new TypeAliasTy(node.name(), node, innerTy)

            const typeParameters = node.typeParameters()
            if (typeParameters.length > 0) {
                return new InstantiationTy(
                    baseTy,
                    typeParameters.map(it => {
                        const defaultTypeNode = it.defaultType()
                        if (defaultTypeNode) {
                            const defaultType = InferenceWalker.convertType(
                                defaultTypeNode,
                                node.file,
                            )
                            return new TypeParameterTy(it, defaultType)
                        }
                        return new TypeParameterTy(it)
                    }),
                )
            }

            return baseTy
        }

        if (node instanceof Enum) {
            return node.declaredType()
        }

        if (node instanceof TypeParameter) {
            const defaultTypeNode = node.defaultType()
            if (defaultTypeNode) {
                const defaultType = InferenceWalker.convertType(defaultTypeNode, node.file)
                return new TypeParameterTy(node, defaultType)
            }
            return new TypeParameterTy(node)
        }

        if (node instanceof FunctionBase) {
            const result = TOLK_CACHE.funcTypeCache.cached(node.node.id, () => {
                return infer(node)
            })

            return result.ctx.getType(node.node)
        }

        return null
    }

    private processVarDefinitionAfterRight(
        lhs: SyntaxNode,
        rightType: Ty,
        outFlow: FlowContext,
    ): void {
        if (lhs.type === "var_declaration") {
            const typeNode = lhs.childForFieldName("type")
            const declaredType = typeNode
                ? InferenceWalker.convertType(typeNode, this.ctx.file)
                : undefined

            const smartcastedTy = declaredType
                ? this.calcSmartcastTypeOnAssignment(declaredType, rightType)
                : rightType

            this.ctx.setVarType(lhs, declaredType ?? rightType)
            this.ctx.setVarType(lhs.childForFieldName("name"), declaredType ?? rightType)
            outFlow.setSink(new SinkExpression(new NamedNode(lhs, this.ctx.file)), smartcastedTy)
        }

        if (lhs.type === "tensor_vars_declaration") {
            const rightTensor = rightType instanceof TensorTy ? rightType : undefined

            const elements = lhs.childrenForFieldName("vars").filter(it => it?.isNamed)
            if (elements.length === 1) {
                // var ([a, b, c]) = [...]
                // ->
                // var [a, b, c] = [...]
                const first = elements[0]
                if (first) {
                    this.processVarDefinitionAfterRight(first, rightType, outFlow)
                    return
                }
            }

            const types: Ty[] = []

            for (const [index, element] of elements.entries()) {
                if (!element) continue

                const hint = rightTensor?.elements[index] ?? UnknownTy.UNKNOWN
                this.processVarDefinitionAfterRight(element, hint, outFlow)
                const elementType = this.ctx.getType(element) ?? UnknownTy.UNKNOWN
                types.push(elementType)
            }

            const type = new TensorTy(types)
            this.ctx.setType(lhs, type)
        }

        if (lhs.type === "tuple_vars_declaration") {
            const rightTuple = rightType instanceof TupleTy ? rightType : undefined

            const elements = lhs.childrenForFieldName("vars").filter(it => it?.isNamed)
            const types: Ty[] = []

            for (const [index, element] of elements.entries()) {
                if (!element) continue

                const hint = rightTuple?.elements[index] ?? UnknownTy.UNKNOWN
                this.processVarDefinitionAfterRight(element, hint, outFlow)
                const elementType = this.ctx.getType(element) ?? UnknownTy.UNKNOWN
                types.push(elementType)
            }

            const type = new TupleTy(types)
            this.ctx.setType(lhs, type)
        }
    }

    private calcSmartcastTypeOnAssignment(leftTy: Ty, rightTy: Ty): Ty {
        const leftUnion = leftTy instanceof UnionTy ? leftTy : undefined
        if (!leftUnion) return leftTy

        // example: `var x: T? = null`, result is null
        // example: `var x: int | (int, User?) = (5, null)`, result is `(int, User?)`
        const leftSubtype = leftUnion.calculateExactVariantToFitRhs(rightTy)
        if (leftSubtype) {
            return leftSubtype
        }

        // example: `var x: int | slice | cell = 4`, result is int
        // example: `var x: T1 | T2 | T3 = y as T3 | T1`, result is `T1 | T3`
        const rightUnion = rightTy instanceof UnionTy ? rightTy : undefined
        if (!rightUnion) return leftUnion

        let lhsHasAllVariantsOfRhs = true
        for (const rightVariant of rightUnion.elements) {
            lhsHasAllVariantsOfRhs = lhsHasAllVariantsOfRhs && leftUnion.contains(rightVariant)
        }

        if (!lhsHasAllVariantsOfRhs || rightUnion.elements.length >= leftUnion.elements.length) {
            return leftUnion
        }

        const subtypesOfLhs: Ty[] = []
        for (const leftVariant of leftUnion.elements) {
            if (rightUnion.contains(leftVariant)) {
                subtypesOfLhs.push(leftVariant)
            }
        }
        return UnionTy.create(subtypesOfLhs)
    }

    private inferTernaryExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const condition = node.childForFieldName("condition")
        if (!condition) return ExprFlow.create(flow, usedAsCondition)

        const thenBranch = node.childForFieldName("consequence")
        const elseBranch = node.childForFieldName("alternative")

        const flowAfterCondition = this.inferExpression(condition, flow, true)

        if (!thenBranch || !elseBranch) {
            return flowAfterCondition
        }

        const flowAfterTrue = this.inferExpression(
            thenBranch,
            flowAfterCondition.trueFlow,
            usedAsCondition,
            hint,
        )
        const flowAfterFalse = this.inferExpression(
            elseBranch,
            flowAfterCondition.falseFlow,
            usedAsCondition,
            hint,
        )

        const thenType = this.ctx.getType(thenBranch) ?? UnknownTy.UNKNOWN
        const elseType = this.ctx.getType(elseBranch) ?? UnknownTy.UNKNOWN

        const conditionType = this.ctx.getType(condition)
        if (conditionType === BoolTy.TRUE) {
            this.ctx.setType(node, thenType)
            return flowAfterTrue
        }

        const resultType = joinTypes(thenType, elseType)

        const outFlow = flowAfterTrue.outFlow.join(flowAfterFalse.outFlow)
        this.ctx.setType(node, resultType)

        return new ExprFlow(outFlow, flowAfterTrue.trueFlow, flowAfterFalse.falseFlow)
    }

    private inferLiteralExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const type = this.inferLiteralType(node)
        this.ctx.setType(node, type)
        const after = ExprFlow.create(flow, usedAsCondition)

        if (usedAsCondition) {
            let constValue: boolean | undefined = undefined
            if (type === BoolTy.FALSE) {
                constValue = false
            } else if (type === BoolTy.TRUE) {
                constValue = true
            }

            if (constValue === undefined) return after

            if (constValue) {
                after.falseFlow.unreachable = UnreachableKind.CantHappen
            } else {
                after.trueFlow.unreachable = UnreachableKind.CantHappen
            }
        }
        return after
    }

    public inferLiteralType(node: SyntaxNode): Ty | null {
        if (node.type === "number_literal") {
            return IntTy.INT
        }

        if (node.type === "string_literal") {
            return StringTy.STRING
        }

        if (node.type === "boolean_literal") {
            if (node.text === "true") {
                return BoolTy.TRUE
            }
            return BoolTy.FALSE
        }

        if (node.type === "null_literal") {
            return NullTy.NULL
        }

        return null
    }

    private inferParenExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const inner = node.childForFieldName("inner")
        if (!inner) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const innerResult = this.inferExpression(inner, flow, usedAsCondition, hint)
        const exprType = this.ctx.getType(inner)
        this.ctx.setType(node, exprType)
        return innerResult
    }

    private inferTensorExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const expressions = node.namedChildren
        const types: Ty[] = []

        const hintTensor = hint instanceof TensorTy ? hint : undefined

        let nextFlow = flow
        for (const [index, expr] of expressions.entries()) {
            if (!expr) continue

            const hintType =
                hintTensor && index < hintTensor.elements.length ? hintTensor.elements[index] : null

            nextFlow = this.inferExpression(expr, nextFlow, false, hintType).outFlow
            const exprType = this.ctx.getType(expr) ?? UnknownTy.UNKNOWN
            types.push(exprType)
        }

        this.ctx.setType(node, new TensorTy(types))
        return ExprFlow.create(nextFlow, usedAsCondition)
    }

    private inferTupleExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
        hint: Ty | null,
    ): ExprFlow {
        const expressions = node.namedChildren
        const types: Ty[] = []

        const hintTuple = hint instanceof TupleTy ? hint : undefined

        let nextFlow = flow
        for (const [index, expr] of expressions.entries()) {
            if (!expr) continue

            const hintType =
                hintTuple && index < hintTuple.elements.length ? hintTuple.elements[index] : null

            nextFlow = this.inferExpression(expr, nextFlow, false, hintType).outFlow
            const exprType = this.ctx.getType(expr) ?? UnknownTy.UNKNOWN
            types.push(exprType)
        }

        this.ctx.setType(node, new TupleTy(types))
        return ExprFlow.create(nextFlow, usedAsCondition)
    }

    private inferAsExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const expr = node.childForFieldName("expr")
        const castedTo = node.childForFieldName("casted_to")

        if (!expr || !castedTo) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const targetType = InferenceWalker.convertType(castedTo, this.ctx.file) ?? UnknownTy.UNKNOWN
        const afterExpr = this.inferExpression(expr, flow, false, targetType)

        this.ctx.setType(node, targetType)
        return afterExpr
    }

    private inferNotNullExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const inner = node.childForFieldName("inner")
        if (!inner) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const afterExpr = this.inferExpression(inner, flow, false)
        const innerType = this.ctx.getType(inner)

        const withoutNull = innerType ? subtractTypes(innerType, NullTy.NULL) : UnknownTy.UNKNOWN

        const actualType = withoutNull instanceof NeverTy ? innerType : withoutNull
        this.ctx.setType(node, actualType)

        if (!usedAsCondition) {
            return afterExpr
        }

        return ExprFlow.create(afterExpr.outFlow, true)
    }

    private inferUnaryExpression(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const operator = node.childForFieldName("operator_name")?.text
        const argument = node.childForFieldName("argument")

        if (!argument || !operator) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const afterArg = this.inferExpression(argument, flow, usedAsCondition)
        const argType = this.ctx.getType(argument) ?? UnknownTy.UNKNOWN

        let resultType: Ty
        switch (operator) {
            case "!": {
                const exprType = this.ctx.getType(argument) ?? BoolTy.BOOL
                const actualExprType = exprType instanceof BoolTy ? exprType.negate() : BoolTy.BOOL
                this.ctx.setType(node, actualExprType)
                return new ExprFlow(afterArg.outFlow, afterArg.falseFlow, afterArg.trueFlow)
            }
            case "-":
            case "+":
            case "~": {
                resultType = IntTy.INT
                break
            }
            default: {
                resultType = argType
                break
            }
        }

        this.ctx.setType(node, resultType)
        return afterArg
    }

    private inferAssignment(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const left = node.childForFieldName("left")
        const right = node.childForFieldName("right")

        if (!left || !right) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        let nextFlow = this.inferLeftSideAssignment(left, flow)

        const leftType = this.ctx.getType(left)

        nextFlow = this.inferExpression(right, nextFlow, false, leftType).outFlow

        const rightType = this.ctx.getType(right) ?? UnknownTy.UNKNOWN

        this.processAssignmentAfterRight(left, rightType, nextFlow)
        this.ctx.setType(node, rightType)

        return ExprFlow.create(nextFlow, usedAsCondition)
    }

    private inferSetAssignment(
        node: SyntaxNode,
        flow: FlowContext,
        usedAsCondition: boolean,
    ): ExprFlow {
        const left = node.childForFieldName("left")
        const right = node.childForFieldName("right")

        if (!left || !right) {
            return ExprFlow.create(flow, usedAsCondition)
        }

        const afterLeft = this.inferExpression(left, flow, false)
        const leftType = this.ctx.getType(left)

        const afterRight = this.inferExpression(right, afterLeft.outFlow, false, leftType)
        const rightType = this.ctx.getType(right) ?? UnknownTy.UNKNOWN

        const resultType = leftType ?? rightType
        this.ctx.setType(node, resultType)

        return ExprFlow.create(afterRight.outFlow, usedAsCondition)
    }

    private inferLeftSideAssignment(node: SyntaxNode, flow: FlowContext): FlowContext {
        switch (node.type) {
            case "parenthesized_expression": {
                const inner = node.childForFieldName("inner")
                if (!inner) return flow
                flow = this.inferLeftSideAssignment(inner, flow)
                this.ctx.setType(node, this.ctx.getType(inner))
                break
            }
            case "tensor_expression":
            case "typed_tuple": {
                const typesList: Ty[] = []
                for (const child of node.namedChildren) {
                    if (!child) continue
                    flow = this.inferLeftSideAssignment(child, flow)
                    typesList.push(this.ctx.getType(child) ?? UnknownTy.UNKNOWN)
                }

                if (node.type === "tensor_expression") {
                    this.ctx.setType(node, new TensorTy(typesList))
                } else {
                    this.ctx.setType(node, new TupleTy(typesList))
                }
                break
            }
            default: {
                flow = this.inferExpression(node, flow, false).outFlow
                const sinkExpression = this.extractSinkExpression(node)
                if (sinkExpression) {
                    const declaredType = this.calcDeclaredTypeBeforeSmartCast(node)
                    this.ctx.setType(node, declaredType)
                }

                break
            }
        }
        return flow
    }

    private calcDeclaredTypeBeforeSmartCast(node: SyntaxNode): Ty | null {
        if (node.type === "identifier") {
            const varDecl = this.ctx.getResolved(node)
            if (varDecl) {
                return this.ctx.getVarType(varDecl.node)
            }
        }

        if (node.type === "dot_access") {
            const qualifier = node.childForFieldName("obj")
            if (!qualifier) return null

            const field = node.childForFieldName("field")

            const qualifierType = this.calcDeclaredTypeBeforeSmartCast(qualifier)?.baseType()

            if (qualifierType instanceof StructTy && field?.type === "identifier") {
                const fieldName = field.text
                const fieldDecl = qualifierType.fields().find(it => it.name(false) === fieldName)
                const fieldTypeNode = fieldDecl?.typeNode()?.node
                if (fieldTypeNode) {
                    return InferenceWalker.convertType(fieldTypeNode, fieldDecl.file)
                }
            }

            if (
                (qualifierType instanceof TensorTy || qualifierType instanceof TupleTy) &&
                field?.type === "numeric_index"
            ) {
                const idx = Number.parseInt(field.text)
                return qualifierType.elements.at(idx) ?? null
            }
        }

        return null
    }

    private processAssignmentAfterRight(left: SyntaxNode, rightType: Ty, flow: FlowContext): void {
        if (left.type === "tensor_vars_declaration") {
            if (!(rightType instanceof TensorTy)) return

            const elements = left.childrenForFieldName("vars").filter(it => it?.isNamed)
            const types: Ty[] = []

            for (const [index, element] of elements.entries()) {
                if (!element) continue
                const rightElementType = rightType.elements[index]
                this.processVarDefinitionAfterRight(element, rightElementType, flow)
                types.push(this.ctx.getType(element) ?? UnknownTy.UNKNOWN)
            }

            const type = new TensorTy(types)
            this.ctx.setType(left, type)
            return
        }

        if (left.type === "tuple_vars_declaration") {
            if (!(rightType instanceof TupleTy)) return

            const elements = left.childrenForFieldName("vars").filter(it => it?.isNamed)
            const types: Ty[] = []

            for (const [index, element] of elements.entries()) {
                if (!element) continue
                const rightElementType = rightType.elements[index]
                this.processVarDefinitionAfterRight(element, rightElementType, flow)
                types.push(this.ctx.getType(element) ?? UnknownTy.UNKNOWN)
            }

            const type = new TupleTy(types)
            this.ctx.setType(left, type)
            return
        }

        const sinkExpr = this.extractSinkExpression(left)
        if (!sinkExpr) {
            return
        }

        const leftType = this.ctx.getType(left)?.unwrapAlias()
        if (!leftType) return

        const castedType = this.calcSmartcastTypeOnAssignment(leftType, rightType)
        flow.setSink(sinkExpr, castedType)
    }

    public extractSinkExpression(expr: SyntaxNode): SinkExpression | null {
        switch (expr.type) {
            case "identifier": {
                const resolved = Reference.resolve(new NamedNode(expr, this.ctx.file))
                if (!resolved) return null

                if (
                    resolved.node.type === "var_declaration" ||
                    resolved.node.type === "parameter_declaration"
                ) {
                    return new SinkExpression(resolved)
                }
                break
            }
            case "dot_access": {
                let currentDot = expr
                let indexPath = 0

                for (let i = 0; i < 255; i++) {
                    const qualifier = currentDot.childForFieldName("obj")
                    const fieldNode = currentDot.childForFieldName("field")
                    if (!fieldNode) break

                    let indexAt = 0
                    if (fieldNode.type === "numeric_index") {
                        indexAt = Number.parseInt(fieldNode.text)
                    } else {
                        const resolvedField = this.ctx.getResolved(fieldNode)
                        if (!(resolvedField instanceof Field)) break

                        const owner = resolvedField.owner()
                        if (!owner) break

                        indexAt = owner.fields().findIndex(it => it.name() === resolvedField.name())
                    }

                    if (indexAt < 0 || indexAt > 255) break // too big index
                    indexPath = (indexPath << 8) + indexAt + 1

                    if (qualifier?.type !== "dot_access") {
                        break
                    }

                    currentDot = qualifier
                }

                if (indexPath === 0) {
                    return null
                }

                const qualifier = currentDot.childForFieldName("obj")
                if (!qualifier) break

                const symbol = this.ctx.getResolved(qualifier)
                if (!symbol) break

                return new SinkExpression(symbol, indexPath)
            }
            case "parenthesized_expression": {
                const inner = expr.childForFieldName("inner")
                return inner ? this.extractSinkExpression(inner) : null
            }
            case "assignment":
            case "set_assignment": {
                const left = expr.childForFieldName("left")
                return left ? this.extractSinkExpression(left) : null
            }
            case "local_vars_declaration": {
                // match (val a = ...)
                const varDecl = expr.children[1]
                if (varDecl?.type === "var_declaration") {
                    return new SinkExpression(new NamedNode(varDecl, this.ctx.file))
                }
            }
        }
        return null
    }

    public static asPrimitiveType(name: string): Ty | null {
        if (name.startsWith("int") || name.startsWith("uint")) {
            const match = /^(u?int)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                return new IntNTy(bitWidth, prefix === "uint")
            }
        }

        if (name.startsWith("varint") || name.startsWith("varuint")) {
            const match = /^(varu?int)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                return new VarIntNTy(bitWidth, prefix === "varuint")
            }
        }

        if (name.startsWith("bits") || name.startsWith("bytes")) {
            const match = /^(bytes|bits)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                if (prefix === "bytes") {
                    return new BytesNTy(bitWidth)
                }
                return new BitsNTy(bitWidth)
            }
        }

        switch (name) {
            case "void": {
                return VoidTy.VOID
            }
            case "int": {
                return IntTy.INT
            }
            case "bool": {
                return BoolTy.BOOL
            }
            case "coins": {
                return CoinsTy.COINS
            }
            case "null": {
                return NullTy.NULL
            }
            case "string": {
                return StringTy.STRING
            }
            case "never": {
                return NeverTy.NEVER
            }
        }
        return null
    }
}

export class SinkExpression {
    public constructor(
        public symbol: NamedNode,
        public indexPath: number = 0,
    ) {}

    public toString(): string {
        let result = this.symbol.name()

        let curPath = this.indexPath
        while (curPath !== 0) {
            result += "."
            result += ((curPath && 0xff) - 1).toString()
            curPath = curPath >> 8
        }

        return result
    }

    public hash(): bigint {
        return (BigInt(this.symbol.node.id) << 64n) | BigInt(this.indexPath)
    }
}

export class InferenceResult {
    public constructor(public ctx: InferenceContext) {}

    public typeOf(node: SyntaxNode | null): Ty | null {
        if (!node) return null
        return this.ctx.getType(node)
    }

    public resolve(node: SyntaxNode): NamedNode | null {
        return this.ctx.getResolved(node)
    }
}

export function infer(decl: NamedNode): InferenceResult {
    try {
        return inferImpl(decl)
    } catch (error: unknown) {
        if (error instanceof RangeError) {
            console.error("detected cyclic dependency, return empty result")
        }
        return new InferenceResult(new InferenceContext(decl.file))
    }
}

function inferImpl(decl: NamedNode): InferenceResult {
    const ctx = new InferenceContext(decl.file)
    const flow = new FlowContext()
    const walker = new InferenceWalker(ctx)

    if (decl instanceof FunctionBase) {
        walker.inferFunction(decl, flow)
    }
    if (decl instanceof Constant) {
        walker.inferConstant(decl, flow)
    }
    if (decl instanceof GlobalVariable) {
        walker.inferGlobalVariable(decl, flow)
    }
    if (decl instanceof Field) {
        walker.inferField(decl, flow)
    }
    if (decl instanceof EnumMember) {
        walker.inferEnumMember(decl, flow)
    }
    if (decl instanceof TypeAlias) {
        walker.inferTypeAlias(decl, flow)
    }

    return new InferenceResult(ctx)
}

// eslint-disable-next-line functional/type-declaration-immutability
interface SyntaxNodeWithCache extends SyntaxNode {
    cacheOwner: NamedNode | undefined
}

function findCacheOwner(ownable: SyntaxNodeWithCache, file: TolkFile): NamedNode | null {
    if (ownable.cacheOwner) {
        return ownable.cacheOwner
    }
    if (ownable.type === "function_declaration") {
        return new FunctionBase(ownable, file)
    }
    if (ownable.type === "method_declaration") {
        return new MethodBase(ownable, file)
    }
    if (ownable.type === "get_method_declaration") {
        return new GetMethod(ownable, file)
    }
    if (ownable.type === "global_var_declaration") {
        return new GlobalVariable(ownable, file)
    }
    if (ownable.type === "constant_declaration") {
        return new Constant(ownable, file)
    }
    if (ownable.type === "struct_field_declaration") {
        return new Field(ownable, file)
    }
    if (ownable.type === "enum_member_declaration") {
        return new EnumMember(ownable, file)
    }
    if (ownable.type === "type_alias_declaration") {
        return new TypeAlias(ownable, file)
    }
    const parent = parentOfType(
        ownable,
        "function_declaration",
        "method_declaration",
        "get_method_declaration",
        "constant_declaration",
        "global_var_declaration",
        "struct_field_declaration",
        "enum_member_declaration",
        "type_alias_declaration",
    )
    if (parent?.type === "function_declaration") {
        return new FunctionBase(parent, file)
    }
    if (parent?.type === "method_declaration") {
        return new MethodBase(parent, file)
    }
    if (parent?.type === "get_method_declaration") {
        return new GetMethod(parent, file)
    }
    if (parent?.type === "global_var_declaration") {
        return new GlobalVariable(parent, file)
    }
    if (parent?.type === "constant_declaration") {
        return new Constant(parent, file)
    }
    if (parent?.type === "struct_field_declaration") {
        return new Field(parent, file)
    }
    if (parent?.type === "enum_member_declaration") {
        return new EnumMember(parent, file)
    }
    if (parent?.type === "type_alias_declaration") {
        return new TypeAlias(parent, file)
    }
    return null
}

export function typeOf(node: SyntaxNode, file: TolkFile): Ty | null {
    const ownable: SyntaxNodeWithCache = node as SyntaxNodeWithCache
    const cacheOwner = findCacheOwner(ownable, file)
    if (!cacheOwner) return null

    ownable.cacheOwner = cacheOwner

    const result = TOLK_CACHE.funcTypeCache.cached(cacheOwner.node.id, () => {
        return infer(cacheOwner)
    })

    return result.ctx.getType(node)
}

export function inferenceOf(node: SyntaxNode, file: TolkFile): InferenceResult | null {
    const ownable: SyntaxNodeWithCache = node as SyntaxNodeWithCache
    const cacheOwner = findCacheOwner(ownable, file)
    if (!cacheOwner) return null

    ownable.cacheOwner = cacheOwner

    return TOLK_CACHE.funcTypeCache.cached(cacheOwner.node.id, () => {
        return infer(cacheOwner)
    })
}

export function functionTypeOf(func: FunctionBase): FuncTy | null {
    const result = TOLK_CACHE.funcTypeCache.cached(func.node.id, () => {
        return infer(func)
    })

    const type = result.ctx.getType(func.node)
    if (type instanceof FuncTy) {
        return type
    }
    return null
}

export function methodCandidates(
    ctx: InferenceContext,
    qualifierTy: Ty,
    searchName: string,
): MethodBase[] {
    return InferenceWalker.methodCandidates(ctx, qualifierTy, searchName)
}
