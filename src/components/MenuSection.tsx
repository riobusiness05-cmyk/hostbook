type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
};

export type MenuGroup = { category: string; items: MenuItem[] };

function CategoryBlock({ group }: { group: MenuGroup }) {
  return (
    <div className="break-inside-avoid">
      <h4 className="mb-5 border-b border-colonial-ember-700/40 pb-2 font-serif text-xl uppercase tracking-[0.25em] text-colonial-ember-300">
        {group.category}
      </h4>
      <ul className="space-y-4">
        {group.items.map((item) => (
          <li key={item.id}>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-base text-colonial-cream sm:text-lg">{item.name}</span>
              <span className="h-px flex-1 translate-y-[-3px] bg-colonial-cream/15" />
              {item.price != null && (
                <span className="font-sans text-sm tracking-wide text-colonial-ember-300">
                  &euro;{item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}
                </span>
              )}
            </div>
            {item.description && (
              <p className="mt-1 font-sans text-[11px] uppercase tracking-[0.12em] text-colonial-fade/70">
                {item.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MenuHalf({ title, groups }: { title: string; groups: MenuGroup[] }) {
  return (
    <div>
      <h3 className="mb-10 text-center font-serif text-3xl font-light uppercase tracking-[0.35em] text-colonial-cream">
        {title}
      </h3>
      <div className="columns-1 gap-14 space-y-12 md:columns-2">
        {groups.map((g) => (
          <CategoryBlock key={g.category} group={g} />
        ))}
      </div>
    </div>
  );
}

export default function MenuSection({ kitchen, bar }: { kitchen: MenuGroup[]; bar: MenuGroup[] }) {
  return (
    <section id="menu" className="bg-colonial-black px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl space-y-24">
        <div className="text-center">
          <p className="font-sans text-xs uppercase tracking-[0.45em] text-colonial-ember-400">The Menu</p>
        </div>
        <MenuHalf title="Kitchen" groups={kitchen} />
        <MenuHalf title="Bar" groups={bar} />
      </div>
    </section>
  );
}
