// Discussion d'equipe. Voir app/models/message.py cote serveur.

export type RefType = 'ao' | 'ao_document' | 'task';

/** Piece citee dans un message. `label` est fige a l'ecriture cote serveur : un
 *  fil doit rester lisible tel qu'il a ete ecrit, meme si le document est
 *  renomme ou supprime. */
export interface MessageRef {
  type:  RefType;
  id:    string;
  label: string;
}

export interface Message {
  id:         string;
  org_id:     string;
  author_id:  string;
  author_nom: string;
  body:       string;
  task_id:    string | null;
  ao_id:      string | null;
  mentions:   string[];
  refs:       MessageRef[];
  created_at: string;
}

export interface MessageList {
  items: Message[];
  total: number;
}

export interface MessageCreate {
  body:     string;
  task_id?: string | null;
  ao_id?:   string | null;
  mentions?: string[];
  refs?:    MessageRef[];
}
