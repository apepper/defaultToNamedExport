import {
  CallExpression,
  Collection,
  JSCodeshift,
  Transform,
} from "jscodeshift";
import type { Identifier } from "jscodeshift";
import type { namedTypes } from "ast-types/gen/namedTypes";
import { format } from "prettier";

const defaultToNamedExport: Transform = (
  fileInfo,
  { jscodeshift: j },
  options
) => {
  const filepath = fileInfo.path;
  const root = j(fileInfo.source);

  // Convert "export default Scrivito.connect(WhateverIdentifier)"
  convertExportDefaultScrivitoConnect(j, root);

  // Convert "export default WhateverIdentifier"
  convertExportDefaultWhateverIdentifier(j, root, filepath);

  // Convert "export default function whatever"
  convertExportDefaultFunctionWhatever(j, root, filepath);

  // Sanity check
  const otherDefaultExport = root.find(j.ExportDefaultDeclaration, {
    type: "ExportDefaultDeclaration",
  });

  if (otherDefaultExport.length === 1) {
    consoleWarn(`Unmodified "export default" found in file ${filepath}!`);
  }

  convertDefaultExportToNamedExport(j, root);

  // return changed source
  return format(root.toSource(options.printOptions), { filepath });
};

export default defaultToNamedExport;

function convertExportDefaultScrivitoConnect(j: JSCodeshift, root: Collection) {
  const defaultConnectExport = root.find(j.ExportDefaultDeclaration, {
    type: "ExportDefaultDeclaration",
    declaration: {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "Scrivito",
        },
        property: {
          type: "Identifier",
          name: "connect",
        },
      },
    },
  });

  if (defaultConnectExport.length === 1) {
    const defaultConnectDeclaration = defaultConnectExport.nodes()[0]
      .declaration as CallExpression;

    if (defaultConnectDeclaration.arguments.length === 1) {
      const connectedIdentifier = defaultConnectDeclaration
        .arguments[0] as Identifier;

      const unconnectedDeclaration = findDeclaration({
        root,
        j,
        identifierName: connectedIdentifier.name,
      });

      if (unconnectedDeclaration?.length === 1) {
        scrivitoConnect(j, unconnectedDeclaration, connectedIdentifier);

        replaceWithComments(
          defaultConnectExport,
          j.exportDefaultDeclaration(connectedIdentifier)
        );
      }
    }
  }
}

function convertExportDefaultWhateverIdentifier(
  j: JSCodeshift,
  root: Collection,
  filepath: string
) {
  const identifierDefaultExport = root.find(j.ExportDefaultDeclaration, {
    type: "ExportDefaultDeclaration",
    declaration: { type: "Identifier" },
  });

  if (identifierDefaultExport.length === 1) {
    const identifierName = (
      identifierDefaultExport.nodes()[0].declaration as Identifier
    ).name;

    const declaration = findDeclaration({ root, j, identifierName });
    if (declaration?.length === 1) {
      replaceWithComments(
        declaration,
        j.exportNamedDeclaration(declaration.nodes()[0])
      );

      const defaultExportComments = identifierDefaultExport.nodes()[0].comments;
      if (defaultExportComments && defaultExportComments.length > 0) {
        consoleWarn(`Deleted a trailing comment in ${filepath}!`);
      }
      identifierDefaultExport.remove();
    }
  }
}

function convertExportDefaultFunctionWhatever(
  j: JSCodeshift,
  root: Collection,
  filepath: string
) {
  const functionDefaultExport = root.find(j.ExportDefaultDeclaration, {
    type: "ExportDefaultDeclaration",
    declaration: { type: "FunctionDeclaration" },
  });

  if (functionDefaultExport.length === 1) {
    const node = functionDefaultExport.nodes()[0];
    replaceWithComments(
      functionDefaultExport,
      j.exportNamedDeclaration(
        node.declaration as namedTypes.FunctionDeclaration
      )
    );

    // @ts-ignore-next-line
    const functionName = node.declaration.id.name;

    if (!filepath.includes(functionName)) {
      consoleWarn(
        `Exported function ${functionName} does not match filename of ${filepath}! Ideally the function and the file should have the same name.`
      );
    }
  }
}

function convertDefaultExportToNamedExport(j: JSCodeshift, root: Collection) {
  root
    .find(j.ImportDeclaration, {
      type: "ImportDeclaration",
      specifiers: [{ type: "ImportDefaultSpecifier" }],
    })
    .forEach((specifier) => {
      const specifierNode = specifier.node;
      const importFrom = specifierNode.source.value?.toString();
      if (
        importFrom &&
        importFrom.startsWith(".") &&
        !importFrom.match(/\.\w+$/)
      ) {
        specifier.replace(
          j.importDeclaration(
            specifierNode.specifiers?.map((importSpec) =>
              importSpec.type === "ImportDefaultSpecifier" && importSpec.local
                ? j.importSpecifier(j.identifier(importSpec.local.name))
                : importSpec
            ),
            specifierNode.source
          )
        );
      }
    });
}

function consoleWarn(message: string): void {
  console.log("\x1b[31m%s\x1b[0m", `WARNING: ${message}`);
}

function findDeclaration({
  root,
  j,
  identifierName,
}: {
  root: Collection;
  j: JSCodeshift;
  identifierName: string;
}):
  | Collection<namedTypes.FunctionDeclaration>
  | Collection<namedTypes.VariableDeclaration>
  | Collection<namedTypes.ClassDeclaration>
  | null {
  const sameNameFunction = root.find(j.FunctionDeclaration, {
    type: "FunctionDeclaration",
    id: { type: "Identifier", name: identifierName },
  });
  if (sameNameFunction.length === 1) return sameNameFunction;

  const sameNameConst = root.find(j.VariableDeclaration, {
    type: "VariableDeclaration",
    declarations: [
      {
        type: "VariableDeclarator",
        id: { type: "Identifier", name: identifierName },
      },
    ],
  });
  if (sameNameConst.length === 1) return sameNameConst;

  const sameNameClass = root.find(j.ClassDeclaration, {
    type: "ClassDeclaration",
    id: { type: "Identifier", name: identifierName },
  });
  if (sameNameClass.length === 1) return sameNameClass;

  return null;
}

function replaceWithComments(
  collection:
    | Collection<namedTypes.FunctionDeclaration>
    | Collection<namedTypes.VariableDeclaration>
    | Collection<namedTypes.ClassDeclaration>
    | Collection<namedTypes.ExportDefaultDeclaration>,
  newNode:
    | namedTypes.FunctionDeclaration
    | namedTypes.VariableDeclaration
    | namedTypes.ClassDeclaration
    | namedTypes.ExportDefaultDeclaration
    | namedTypes.ExportNamedDeclaration
) {
  const node = collection.nodes()[0];
  newNode.comments = node.comments;
  node.comments = null;

  collection.replaceWith(newNode);
}

function scrivitoConnect(
  j: JSCodeshift,
  collection:
    | Collection<namedTypes.FunctionDeclaration>
    | Collection<namedTypes.VariableDeclaration>
    | Collection<namedTypes.ClassDeclaration>,
  connectedIdentifier: Identifier
) {
  const node = collection.nodes()[0];

  replaceWithComments(
    collection,
    j.variableDeclaration("const", [
      j.variableDeclarator(
        connectedIdentifier,
        j.callExpression(
          j.memberExpression(j.identifier("Scrivito"), j.identifier("connect")),
          [callExpressionArguments(j, node)]
        )
      ),
    ])
  );
}

function callExpressionArguments(
  j: JSCodeshift,
  node:
    | namedTypes.FunctionDeclaration
    | namedTypes.VariableDeclaration
    | namedTypes.ClassDeclaration
) {
  if (node.type === "FunctionDeclaration") {
    return j.functionExpression(node.id, node.params, node.body);
  }

  if (node.type === "ClassDeclaration") {
    return j.classExpression(node.id, node.body, node.superClass);
  }

  throw new Error(`Node type ${node.type} not yet implemented`);
}
