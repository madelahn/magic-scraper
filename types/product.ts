export type Product = {
    title: string;
    price: string;
    inventory: string[];
    condition: string;
    image: string;
    link: string;
    store: string;
};

export interface ScrapeCardProps {
    card: string;
}