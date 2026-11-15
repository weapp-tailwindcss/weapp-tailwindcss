import type {
  CalcNode,
  MathExpression,
  ParenthesizedExpression,
  ValueExpression,
} from '../parser';
import convertUnit from './convertUnit.ts';

function isValueType(node: CalcNode): node is ValueExpression {
  switch (node.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
    case 'EmValue':
    case 'ExValue':
    case 'ChValue':
    case 'RemValue':
    case 'VhValue':
    case 'SvhValue':
    case 'LvhValue':
    case 'DvhValue':
    case 'VwValue':
    case 'SvwValue':
    case 'LvwValue':
    case 'DvwValue':
    case 'VminValue':
    case 'SvminValue':
    case 'LvminValue':
    case 'DvminValue':
    case 'VmaxValue':
    case 'SvmaxValue':
    case 'LvmaxValue':
    case 'DvmaxValue':
    case 'VbValue':
    case 'SvbValue':
    case 'LvbValue':
    case 'DvbValue':
    case 'ViValue':
    case 'SviValue':
    case 'LviValue':
    case 'DviValue':
    case 'CqwValue':
    case 'CqhValue':
    case 'CqiValue':
    case 'CqbValue':
    case 'CqminValue':
    case 'CqmaxValue':
    case 'PercentageValue':
    case 'LhValue':
    case 'RlhValue':
    case 'Number':
      return true;
  }
  return false;
}

function flip(operator: '-' | '+'): '-' | '+' {
  return operator === '+' ? '-' : '+';
}

function isAddSubOperator(operator: string): operator is '+' | '-' {
  return operator === '+' || operator === '-';
}

interface Collectible {
  preOperator: '+' | '-';
  node: CalcNode;
}

function collectAddSubItems(
  preOperator: '+' | '-',
  node: CalcNode,
  collected: Collectible[],
  precision: number
): void {
  if (!isAddSubOperator(preOperator)) {
    throw new Error(`invalid operator ${preOperator}`);
  }
  if (isValueType(node)) {
    const itemIndex = collected.findIndex((x) => x.node.type === node.type);
    if (itemIndex >= 0) {
      if (node.value === 0) {
        return;
      }
      const otherValueNode = collected[itemIndex].node as ValueExpression;
      const { left: reducedNode, right: current } = convertNodesUnits(
        otherValueNode,
        node,
        precision
      );

      if (collected[itemIndex].preOperator === '-') {
        collected[itemIndex].preOperator = '+';
        reducedNode.value *= -1;
      }
      if (preOperator === '+') {
        reducedNode.value += current.value;
      } else {
        reducedNode.value -= current.value;
      }
      // make sure reducedNode.value >= 0
      if (reducedNode.value >= 0) {
        collected[itemIndex] = { node: reducedNode, preOperator: '+' };
      } else {
        reducedNode.value *= -1;
        collected[itemIndex] = { node: reducedNode, preOperator: '-' };
      }
    } else {
      // make sure node.value >= 0
      if (node.value >= 0) {
        collected.push({ node, preOperator });
      } else {
        node.value *= -1;
        collected.push({ node, preOperator: flip(preOperator) });
      }
    }
  } else if (node.type === 'MathExpression') {
    if (isAddSubOperator(node.operator)) {
      collectAddSubItems(preOperator, node.left, collected, precision);
      const collectRightOperator =
        preOperator === '-' ? flip(node.operator) : node.operator;
      collectAddSubItems(
        collectRightOperator,
        node.right,
        collected,
        precision
      );
    } else {
      // * or /
      const reducedNode = reduce(node, precision);
      // prevent infinite recursive call
      if (
        reducedNode.type !== 'MathExpression' ||
        isAddSubOperator(reducedNode.operator)
      ) {
        collectAddSubItems(preOperator, reducedNode, collected, precision);
      } else {
        collected.push({ node: reducedNode, preOperator });
      }
    }
  } else if (node.type === 'ParenthesizedExpression') {
    collectAddSubItems(preOperator, node.content, collected, precision);
  } else {
    collected.push({ node, preOperator });
  }
}

function reduceAddSubExpression(node: CalcNode, precision: number): CalcNode {
  const collected: Collectible[] = [];
  collectAddSubItems('+', node, collected, precision);

  const withoutZeroItem = collected.filter(
    (item) => !(
      isValueType(item.node)
      && item.node.type !== 'PercentageValue'
      && item.node.value === 0
    )
  );
  const firstNonZeroItem = withoutZeroItem[0]; // could be undefined

  // prevent producing "calc(-var(--a))" or "calc()"
  // which is invalid css
  if (
    !firstNonZeroItem ||
    (firstNonZeroItem.preOperator === '-' &&
      !isValueType(firstNonZeroItem.node))
  ) {
    const firstZeroItem = collected.find(
      (item) => isValueType(item.node) && item.node.value === 0
    );
    if (firstZeroItem) {
      withoutZeroItem.unshift(firstZeroItem);
    }
  }

  // make sure the preOperator of the first item is +
  const firstItem = withoutZeroItem[0];

  if (firstItem.preOperator === '-' && isValueType(firstItem.node)) {
    firstItem.node.value *= -1;
    firstItem.preOperator = '+';
  }

  let root = firstItem.node;
  for (let i = 1; i < withoutZeroItem.length; i++) {
    root = {
      type: 'MathExpression',
      operator: withoutZeroItem[i].preOperator,
      left: root,
      right: withoutZeroItem[i].node,
    };
  }

  return root;
}
function reduceDivisionExpression(node: MathExpression): CalcNode {
  if (!isValueType(node.right)) {
    return node;
  }

  if (node.right.type !== 'Number') {
    throw new Error(`Cannot divide by "${node.right.unit}", number expected`);
  }

  return applyNumberDivision(node.left, node.right.value);
}

function applyNumberDivision(node: CalcNode, divisor: number): CalcNode {
  if (divisor === 0) {
    throw new Error('Cannot divide by zero');
  }
  if (isValueType(node)) {
    node.value /= divisor;
    return node;
  }
  if (node.type === 'MathExpression' && isAddSubOperator(node.operator)) {
    // turn (a + b) / num into a/num + b/num
    // is good for further reduction
    // checkout the test case
    // "should reduce division before reducing additions"
    return {
      type: 'MathExpression',
      operator: node.operator,
      left: applyNumberDivision(node.left, divisor),
      right: applyNumberDivision(node.right, divisor),
    };
  }
  // it is impossible to reduce it into a single value
  // .e.g the node contains css variable
  // so we just preserve the division and let browser do it
  return {
    type: 'MathExpression',
    operator: '/',
    left: node,
    right: {
      type: 'Number',
      value: divisor,
    },
  };
}
function reduceMultiplicationExpression(node: MathExpression): CalcNode {
  // (expr) * number
  if (node.right.type === 'Number') {
    return applyNumberMultiplication(node.left, node.right.value);
  }
  // number * (expr)
  if (node.left.type === 'Number') {
    return applyNumberMultiplication(node.right, node.left.value);
  }
  return node;
}

function applyNumberMultiplication(
  node: CalcNode,
  multiplier: number
): CalcNode {
  if (isValueType(node)) {
    node.value *= multiplier;
    return node;
  }
  if (node.type === 'MathExpression' && isAddSubOperator(node.operator)) {
    // turn (a + b) * num into a*num + b*num
    // is good for further reduction
    // checkout the test case
    // "should reduce multiplication before reducing additions"
    return {
      type: 'MathExpression',
      operator: node.operator,
      left: applyNumberMultiplication(node.left, multiplier),
      right: applyNumberMultiplication(node.right, multiplier),
    };
  }
  // it is impossible to reduce it into a single value
  // .e.g the node contains css variable
  // so we just preserve the division and let browser do it
  return {
    type: 'MathExpression',
    operator: '*',
    left: node,
    right: {
      type: 'Number',
      value: multiplier,
    },
  };
}

function convertNodesUnits(
  left: ValueExpression,
  right: ValueExpression,
  precision: number
): { left: ValueExpression; right: ValueExpression } {
  switch (left.type) {
    case 'LengthValue':
    case 'AngleValue':
    case 'TimeValue':
    case 'FrequencyValue':
    case 'ResolutionValue':
      if (right.type === left.type && right.unit && left.unit) {
        const converted = convertUnit(
          right.value,
          right.unit,
          left.unit,
          precision
        );

        right = {
          type: left.type,
          value: converted,
          unit: left.unit,
        };
      }

      return { left, right };
    default:
      return { left, right };
  }
}

function includesNoCssProperties(node: ParenthesizedExpression): boolean {
  return (
    node.content.type !== 'Function' &&
    (node.content.type !== 'MathExpression' ||
      (node.content.right.type !== 'Function' &&
        node.content.left.type !== 'Function'))
  );
}
export default function reduce(node: CalcNode, precision: number): CalcNode {
  if (
    node.type === 'MathExpression' &&
    (node.left.type === 'CalcKeyword' || node.right.type === 'CalcKeyword')
  ) {
    return node;
  }
  if (node.type === 'MathExpression') {
    if (isAddSubOperator(node.operator)) {
      // reduceAddSubExpression will call reduce recursively
      return reduceAddSubExpression(node, precision);
    }
    node.left = reduce(node.left, precision);
    node.right = reduce(node.right, precision);
    switch (node.operator) {
      case '/':
        return reduceDivisionExpression(node);
      case '*':
        return reduceMultiplicationExpression(node);
    }

    return node;
  }

  if (node.type === 'ParenthesizedExpression') {
    if (includesNoCssProperties(node)) {
      return reduce(node.content, precision);
    }
  }

  return node;
}
