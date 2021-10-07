import { Json } from 'json-rpc-engine';

import { UnrecognizedCaveatTypeError } from './errors';
import {
  AsyncRestrictedMethod,
  RestrictedMethodBase,
  GenericPermission,
  GenericRestrictedMethodParams,
} from './Permission';

/**
 * Identical to instances of the Caveat class, useful for when TypeScript
 * has a meltdown over assigning classes to the Json type.
 *
 * @template Type - The type of the caveat.
 * @template Value - The value associated with the caveat.
 */
export type CaveatConstraint<Type extends string, Value extends Json> = {
  /**
   * The type of the caveat. The type is presumed to be meaningful in the
   * context of the capability it is associated with.
   *
   * In MetaMask, every permission can only have one caveat of each type.
   */
  readonly type: Type;

  /**
   * Any additional data necessary to enforce the caveat.
   *
   * TODO:TS4.4 Make optional
   */
  readonly value: Value;
};

/**
 * The {@link CaveatConstraint} factory function. Naively constructs a new caveat from the
 * inputs. Sets `value` to `null` if no value is provided.
 *
 * @param type - The type of the caveat.
 * @param value - The value associated with the caveat, if any.
 * @returns The new caveat object.
 */
export function constructCaveat<Type extends string, Value extends Json>(
  type: Type,
  value: Value,
): CaveatConstraint<Type, Value> {
  return { type, value };
}

// Next, we define types used for specifying caveats at the consumer layer,
// and a function for applying caveats to a restricted method request. This is
// Accomplished by decorating the restricted method implementation with the
// the corresponding caveat functions.

/**
 * A function for applying caveats to a restricted method request.
 *
 * @template Caveat - The caveat type associated with this decorator.
 * @param decorated - The restricted method implementation to be decorated.
 * The method may have already been decorated with other caveats.
 * @param caveat - The caveat object.
 * @returns The decorate restricted method implementation.
 */
export type CaveatDecorator<Caveat extends GenericCaveat> = (
  decorated: AsyncRestrictedMethod<GenericRestrictedMethodParams, Json>,
  caveat: Caveat,
) => AsyncRestrictedMethod<GenericRestrictedMethodParams, Json>;

/**
 *
 */
export type CaveatValidator<Caveat extends GenericCaveat> = (
  caveat: { type: Caveat['type']; value: unknown },
  origin?: string,
  target?: string,
) => void;

export type CaveatSpecification<Caveat extends GenericCaveat> = {
  /**
   * The string type of the caveat.
   */
  type: Caveat['type'];

  /**
   * The decorator function used to apply the caveat to restricted method
   * requests.
   */
  decorator: CaveatDecorator<Caveat>;

  /**
   * The validator function used to validate caveats of the associated type
   * whenever they are instantiated. Caveat are instantiated whenever they are
   * created or mutated.
   *
   * The validator should throw an appropriate JSON-RPC error if validation fails.
   *
   * If no validator is specified, no validation of caveat values will be
   * performed. Although caveats can also be validated by permission validators,
   * validating caveat values separately is strongly recommended.
   */
  validator?: CaveatValidator<Caveat>;
};

/**
 * A generic caveat.
 */
export type GenericCaveat = CaveatConstraint<string, Json>;

/**
 * An object mapping the type of each caveat to its corresponding specification.
 */
export type CaveatSpecifications<Caveat extends GenericCaveat> = {
  [Type in Caveat['type']]: ExtractCaveatSpecification<Caveat, Type>;
};

type ExtractCaveatSpecification<
  Caveat extends GenericCaveat,
  CaveatType extends string,
> = Caveat extends CaveatConstraint<CaveatType, Json>
  ? CaveatSpecification<Caveat>
  : never;

export type ExtractCaveatFromType<
  Caveat extends GenericCaveat,
  CaveatType extends string,
> = Caveat extends CaveatConstraint<CaveatType, Json> ? Caveat : never;

/**
 * Decorate a restricted method implementation with its caveats.
 *
 * Note that all caveat functions (i.e. the argument and return value of the
 * decorator) must be awaited.
 */
export function decorateWithCaveats<Caveat extends GenericCaveat>(
  methodImplementation: RestrictedMethodBase<
    GenericRestrictedMethodParams,
    Json
  >,
  permission: Readonly<GenericPermission>, // bound to the requesting origin
  caveatSpecifications: CaveatSpecifications<Caveat>, // all caveat implementations
): RestrictedMethodBase<GenericRestrictedMethodParams, Json> {
  const { caveats } = permission;
  if (!caveats) {
    return methodImplementation;
  }

  let decorated = methodImplementation as AsyncRestrictedMethod<
    GenericRestrictedMethodParams,
    Json
  >;

  for (const caveat of caveats) {
    const specification = caveatSpecifications[caveat.type as Caveat['type']];
    if (!specification) {
      throw new UnrecognizedCaveatTypeError(caveat.type);
    }

    decorated = specification.decorator(decorated, caveat);
  }

  return decorated;
}
