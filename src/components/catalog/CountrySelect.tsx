import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COUNTRIES, Country, getCountryByCode } from '@/lib/countries';

interface CountrySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  // For catalog filter: only show countries that are used
  availableCountryCodes?: string[];
  showAllOption?: boolean;
  allOptionLabel?: string;
  disabled?: boolean;
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder = 'Select country',
  availableCountryCodes,
  showAllOption = false,
  allOptionLabel = 'All Countries',
  disabled = false,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Get the list of countries to display
  const countries = useMemo(() => {
    if (availableCountryCodes && availableCountryCodes.length > 0) {
      // Only show countries from the available list
      return COUNTRIES.filter(c => availableCountryCodes.includes(c.code));
    }
    return COUNTRIES;
  }, [availableCountryCodes]);

  // Filter countries based on search
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countries;
    const lowerSearch = search.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      c.code.toLowerCase().includes(lowerSearch)
    );
  }, [countries, search]);

  // Get display value
  const selectedCountry = value && value !== 'all' ? getCountryByCode(value) : null;
  const displayValue = selectedCountry 
    ? `${selectedCountry.flag} ${selectedCountry.name}` 
    : (value === 'all' && showAllOption ? allOptionLabel : placeholder);

  const handleSelect = (countryCode: string) => {
    onValueChange(countryCode);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(showAllOption ? 'all' : '');
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selectedCountry && value !== 'all' && "text-muted-foreground"
          )}
        >
          <span className="truncate">{displayValue}</span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selectedCountry && (
              <X 
                className="h-4 w-4 opacity-50 hover:opacity-100" 
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
            />
          </div>
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] overflow-y-auto">
              {showAllOption && (
                <CommandItem
                  value="all"
                  onSelect={() => handleSelect('all')}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === 'all' ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>🌍</span>
                  <span className="ml-2">{allOptionLabel}</span>
                </CommandItem>
              )}
              {filteredCountries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={() => handleSelect(country.code)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-lg">{country.flag}</span>
                  <span className="ml-2">{country.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
