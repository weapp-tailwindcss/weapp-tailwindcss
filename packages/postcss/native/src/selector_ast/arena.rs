// 可变遍历游标兼容 postcss-selector-parser，许可见 native/THIRD_PARTY_LICENSES.txt。
#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Root,
    Selector,
    Pseudo,
    Class,
    Id,
    Tag,
    Universal,
    Attribute,
    Combinator,
    Nesting,
    String,
}

#[derive(Clone)]
pub struct Node {
    pub kind: Kind,
    pub value: Vec<u16>,
    pub raw: Option<Vec<u16>>,
    pub children: Vec<usize>,
    pub parent: Option<usize>,
    pub cursor: Option<isize>,
}

pub struct Arena {
    pub nodes: Vec<Node>,
    pub trailing_comma: bool,
}

impl Arena {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            trailing_comma: false,
        }
    }

    pub fn add(&mut self, kind: Kind, value: Vec<u16>, parent: Option<usize>) -> usize {
        let id = self.nodes.len();
        self.nodes.push(Node {
            kind,
            value,
            raw: None,
            children: Vec::new(),
            parent,
            cursor: None,
        });
        if let Some(parent) = parent {
            self.nodes[parent].children.push(id);
        }
        id
    }

    pub fn remove(&mut self, id: usize) {
        let Some(parent) = self.nodes[id].parent.take() else {
            return;
        };
        let Some(index) = self.nodes[parent]
            .children
            .iter()
            .position(|child| *child == id)
        else {
            return;
        };
        self.nodes[parent].children.remove(index);
        if let Some(cursor) = &mut self.nodes[parent].cursor {
            if *cursor >= index as isize {
                *cursor -= 1;
            }
        }
    }

    pub fn insert_before(&mut self, target: usize, replacement: usize) {
        let Some(parent) = self.nodes[target].parent else {
            return;
        };
        let Some(index) = self.nodes[parent]
            .children
            .iter()
            .position(|child| *child == target)
        else {
            return;
        };
        self.nodes[replacement].parent = Some(parent);
        self.nodes[parent].children.insert(index, replacement);
        if let Some(cursor) = &mut self.nodes[parent].cursor {
            if *cursor >= index as isize {
                *cursor += 1;
            }
        }
    }

    pub fn replace(&mut self, target: usize, replacements: &[usize]) {
        for replacement in replacements {
            self.insert_before(target, *replacement);
        }
        self.remove(target);
    }

    pub fn clone_tree(&mut self, id: usize, parent: Option<usize>) -> usize {
        let original = self.nodes[id].clone();
        let cloned = self.add(original.kind, original.value, parent);
        self.nodes[cloned].raw = original.raw;
        for child in original.children {
            self.clone_tree(child, Some(cloned));
        }
        cloned
    }

    pub fn clone_children(&mut self, id: usize) -> Vec<usize> {
        self.nodes[id]
            .children
            .clone()
            .iter()
            .map(|child| self.clone_tree(*child, None))
            .collect()
    }

    pub fn top_selector(&self, id: usize) -> Option<usize> {
        let mut current = id;
        while let Some(parent) = self.nodes[current].parent {
            if self.nodes[parent].kind == Kind::Root {
                break;
            }
            current = parent;
        }
        (self.nodes[current].kind == Kind::Selector).then_some(current)
    }
}
