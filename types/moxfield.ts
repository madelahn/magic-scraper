export interface MoxfieldCard {
    name: string;
    scryfall_id: string;
    quantity: number;
    condition: string;
    isFoil: boolean;
    set: string;
    set_name: string;
    type_line: string; // Make sure this isn't optional
}